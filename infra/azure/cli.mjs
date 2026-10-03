import { credentialFor, containersFor, Arm, required, resourceId, startJob, waitJob } from './azure.mjs';
import { reconcileFirewall } from './firewall.mjs';
import { checkExports } from './check.mjs';
import { exportDatabase } from './export.mjs';

const mode = process.argv[2];
const env = process.env;
const jobSeconds = Number(env.JOB_TIMEOUT_SECONDS ?? 600);
const budget = ['firewall', 'export-check', 'start-job'].includes(mode) ? 55000
  : mode === 'wait-job' ? (Math.min(600, jobSeconds) + 120) * 1000
  : 590000;
const controller = new AbortController();
const timer = setTimeout(() => { controller.abort(); process.stderr.write('Maintenance execution deadline exceeded\n'); process.exit(1); }, budget);
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
try {
  if (!Number.isFinite(budget) || budget < 1000 || !Number.isFinite(jobSeconds) || jobSeconds < 1 || jobSeconds > 600) throw new Error('Invalid execution timeout');
  const credential = credentialFor(env);
  const signal = controller.signal;
  let result;
  if (['start-job', 'wait-job'].includes(mode)) {
    const arm = new Arm(credential, signal);
    const job = resourceId(required(env, 'JOB_RESOURCE_ID'), 'Microsoft.App/jobs');
    result = mode === 'start-job'
      ? await startJob(arm, job, { image: env.JOB_IMAGE_DIGEST, command: env.JOB_COMMAND_JSON ? JSON.parse(env.JOB_COMMAND_JSON) : undefined })
      : await waitJob(arm, job, required(env, 'JOB_EXECUTION_NAME'));
  } else {
    const containers = containersFor(env, credential);
    if (mode === 'firewall') result = await reconcileFirewall(env, credential, containers.control, signal);
    else if (mode === 'export-check') result = await checkExports(env, credential, containers, signal);
    else if (mode === 'export') result = await exportDatabase(env, credential, containers, signal);
    else throw new Error('Expected firewall, export-check, export, start-job or wait-job');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  // Never log SDK error objects, HTTP bodies, URLs, subprocess stderr or credentials.
  const code = typeof error.statusCode === 'number' ? ` HTTP ${error.statusCode}` : '';
  process.stderr.write(`Maintenance ${['firewall', 'export-check', 'export', 'start-job', 'wait-job'].includes(mode) ? mode : 'command'} failed${code}; inspect redacted job status and retained control metadata\n`);
  process.exitCode = 1;
} finally { clearTimeout(timer); }
