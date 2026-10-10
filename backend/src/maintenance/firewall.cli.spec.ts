import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import ts from 'typescript';

const apiResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/containerApps/ciri-api';
const migrationJobResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-migration';
const exportJobResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-export';
const postgresServerResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/ciri-db';

interface CompiledCli {
    root: string;
    firewall: string;
}

function compileCli(): CompiledCli {
    const root = mkdtempSync(join(tmpdir(), 'ciri-firewall-cli-'));
    for (const file of ['azure', 'firewall']) {
        const sourcePath = resolve(__dirname, `${file}.ts`);
        const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2023,
                esModuleInterop: true,
            },
            fileName: sourcePath,
        }).outputText;
        writeFileSync(join(root, `${file}.js`), output, 'utf8');
    }
    return { root, firewall: join(root, 'firewall.js') };
}

function childEnvironment(): NodeJS.ProcessEnv {
    return {
        PATH: process.env.PATH,
        NODE_PATH: resolve(__dirname, '../../node_modules'),
    };
}

describe('compiled firewall CLI', () => {
    let compiled: CompiledCli;

    beforeEach(() => {
        compiled = compileCli();
    });

    afterEach(() => {
        rmSync(compiled.root, { recursive: true, force: true });
    });

    it('runs the compiled entrypoint and rejects missing settings without contacting Azure', () => {
        const result = spawnSync(process.execPath, [compiled.firewall], {
            cwd: resolve(__dirname, '../..'),
            env: childEnvironment(),
            encoding: 'utf8',
            timeout: 10_000,
        });

        expect(result.status).not.toBe(0);
        expect(`${result.stdout}\n${result.stderr}`).toMatch(
            /AZURE_STORAGE_ACCOUNT is required/,
        );
    });

    it('is side-effect free when imported as a library', () => {
        const result = spawnSync(
            process.execPath,
            [
                '-e',
                `require(${JSON.stringify(compiled.firewall)}); process.stdout.write('loaded')`,
            ],
            {
                cwd: resolve(__dirname, '../..'),
                env: childEnvironment(),
                encoding: 'utf8',
                timeout: 10_000,
            },
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('loaded');
        expect(`${result.stdout}\n${result.stderr}`).not.toMatch(
            /required|reconciliation failed/i,
        );
    });

    it('reports failed automatic deletions with a bounded rule summary', () => {
        const preloadPath = join(compiled.root, 'mock-azure.cjs');
        writeFileSync(
            preloadPath,
            `const Module = require('module');
const { basename } = require('node:path');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent && basename(parent.filename) === 'firewall.js' && request === './azure') {
    return {
      createAzureMaintenanceClientsFromEnv: () => ({
        arm: {
          getJson: async (resourceId) => resourceId.endsWith('/firewallRules')
            ? { value: [{ name: 'ciri-auto-20.10.0.99', properties: { startIpAddress: '20.10.0.99', endIpAddress: '20.10.0.99' } }] }
            : { properties: { outboundIpAddresses: ['20.10.0.1'] } },
          putJson: async () => ({}),
          delete: async () => { const error = new Error('propagation failure'); error.statusCode = 503; throw error; }
        },
        control: {
          acquireLease: async () => ({ leaseId: 'lease', release: async () => undefined }),
          loadJson: async () => ({ version: 1, rules: { '20.10.0.99': { name: 'ciri-auto-20.10.0.99', firstSeenAt: '2026-10-08T00:00:00.000Z', retiredAt: '2026-10-09T00:00:00.000Z' } } }),
          saveJson: async () => undefined
        }
      })
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
`,
            'utf8',
        );
        const result = spawnSync(process.execPath, [compiled.firewall], {
            cwd: resolve(__dirname, '../..'),
            env: {
                ...childEnvironment(),
                NODE_OPTIONS: `--require=${preloadPath}`,
                FIREWALL_SOURCE_RESOURCE_IDS: JSON.stringify([
                    apiResourceId,
                    migrationJobResourceId,
                    exportJobResourceId,
                ]),
                POSTGRES_SERVER_RESOURCE_ID: postgresServerResourceId,
                AZURE_STORAGE_ACCOUNT: 'ciristorage',
                AZURE_CONTROL_CONTAINER: 'control',
                AZURE_CLIENT_ID: 'client-id',
            },
            encoding: 'utf8',
            timeout: 10_000,
        });

        const output = `${result.stdout}\n${result.stderr}`;
        expect(result.status).not.toBe(0);
        expect(output).toMatch(/20\.10\.0\.99/);
        expect(output).toMatch(/failed|delet/i);
    });
});
