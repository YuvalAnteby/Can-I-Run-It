import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { required, PG_SCOPE } from './azure.mjs';

const exec = promisify(execFile);
export async function pgTool(tool, args, env, signal, timeout = 60000) {
  signal.throwIfAborted();
  try {
    const { stdout } = await exec(tool, args, { env, signal, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    return stdout;
  } catch (error) {
    // stderr is private and used only to classify bounded connection retries, never logged.
    const failure = new Error(`${tool} failed`);
    failure.retryable = /no pg_hba\.conf entry|connection timed out|timeout expired|could not connect|connection refused|server closed the connection unexpectedly/i.test(error.stderr ?? '');
    failure.code = error.code;
    throw failure;
  }
}

export async function pgEnvironment(env, credential) {
  if (env.MAINTENANCE_AUTH_MODE !== 'managed-identity') throw new Error('Portable exports require the explicit exporter UAMI');
  if (env.POSTGRES_SSL_MODE !== 'verify-full') throw new Error('Portable exports require verify-full TLS');
  const host = required(env, 'POSTGRES_HOST');
  const user = required(env, 'POSTGRES_USER');
  const db = required(env, 'POSTGRES_DB');
  const port = env.POSTGRES_PORT ?? '5432';
  if (!/^[a-z0-9-]+\.postgres\.database\.azure\.com$/i.test(host) || user !== 'ciri-exporter' || !/^[A-Za-z0-9_-]+$/.test(db) || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid export PostgreSQL configuration');
  const root = required(env, 'POSTGRES_SSL_ROOT_CERT');
  await readFile(root); // Fail before token acquisition if trusted roots are absent.
  const token = await credential.getToken(PG_SCOPE);
  if (!token?.token || !Number.isFinite(token.expiresOnTimestamp) || token.expiresOnTimestamp - Date.now() < 60000) throw new Error('Fresh Entra database token unavailable');
  // Deliberately inherit only process essentials; reject PGOPTIONS/PGSERVICE/PGPASSWORD overrides.
  return { PATH: env.PATH, ...(env.SystemRoot ? { SystemRoot: env.SystemRoot } : {}), ...(env.HOME ? { HOME: env.HOME } : {}),
    PGHOST: host, PGPORT: port, PGUSER: user, PGDATABASE: db, PGPASSWORD: token.token,
    PGSSLMODE: 'verify-full', PGSSLROOTCERT: root, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'ciri-exporter' };
}

export async function retryDatabase(action, signal, { budgetMs = 300000, now = Date.now, pause = sleep } = {}) {
  const deadline = now() + budgetMs;
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]);
  let attempts = 0;
  while (true) {
    boundedSignal.throwIfAborted();
    try { return await action(boundedSignal); }
    catch (error) {
      const remaining = deadline - now();
      if (!error.retryable || remaining <= 0) throw error;
      await pause(Math.min(remaining, Math.min(10000, 1000 * 2 ** Math.min(attempts++, 4))), undefined, { signal: boundedSignal });
      if (now() >= deadline) throw error;
    }
  }
}

export async function createDump(env, credential, directory, signal, run = pgTool) {
  const dump = `${directory}/ciri.dump`;
  const version = (await run('pg_dump', ['--version'], { PATH: env.PATH, SystemRoot: env.SystemRoot }, signal)).trim();
  const restoreVersion = await run('pg_restore', ['--version'], { PATH: env.PATH, SystemRoot: env.SystemRoot }, signal);
  if (!/\b16\./.test(version) || !/\b16\./.test(restoreVersion)) throw new Error('PostgreSQL 16 client tools are required');
  await retryDatabase(async boundedSignal => {
    const pg = await pgEnvironment(env, credential);
    try { await run('psql', ['-X', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command=SELECT 1'], pg, boundedSignal, 15000); }
    finally { delete pg.PGPASSWORD; }
  }, signal);
  const pg = await pgEnvironment(env, credential);
  let schemaVersion;
  try {
    schemaVersion = (await run('psql', ['-X', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', "--command=SELECT COALESCE((SELECT name FROM public.migrations ORDER BY id DESC LIMIT 1), 'empty')"], pg, signal, 15000)).trim();
    if (!schemaVersion || schemaVersion.length > 256 || !/^[A-Za-z0-9_.-]+$/.test(schemaVersion)) throw new Error('Invalid migration version');
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--no-password', `--file=${dump}`], pg, signal, 240000);
  } finally { delete pg.PGPASSWORD; }
  const contents = await run('pg_restore', ['--list', dump], { PATH: env.PATH, SystemRoot: env.SystemRoot }, signal);
  if (!contents.includes('TABLE DATA') || !contents.includes('migrations')) throw new Error('Dump does not contain application data and migration ledger');
  return { dump, contents, postgres_version: version, schema_version: schemaVersion };
}
