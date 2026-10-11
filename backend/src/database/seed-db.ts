import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { initializeMaintenanceDatabase } from './database.config';
import { maintenanceDataSource, runMaintenance } from './maintenance';

export async function seed(
    env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
    const source: DataSource = maintenanceDataSource(env);
    try {
        await initializeMaintenanceDatabase(source);
        await runMaintenance(source, 'seed');
    } finally {
        if (source.isInitialized) await source.destroy();
    }
}

async function main(): Promise<void> {
    try {
        await seed();
        new Logger('DatabaseSeed').log('Seed completed');
    } catch {
        new Logger('DatabaseSeed').error(
            'Database seed failed; release is blocked',
        );
        process.exitCode = 1;
    }
}

if (require.main === module) void main();
