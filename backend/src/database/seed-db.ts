import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Gpu } from '../gpu/entities/gpu.entity';
import { Cpu } from 'src/cpu/entities/cpu.entity';

dotenv.config();

// Setup a temporary connection strictly for seeding
const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'username',
    password: process.env.POSTGRES_PASSWORD || 'changeme',
    database: process.env.POSTGRES_DB || 'myciridb',
    entities: [Gpu], // TODO CPUs
    synchronize: false,
});

async function seed() {
    await AppDataSource.initialize();
    console.log('Database connected for seeding...');

    const gpuRepository = AppDataSource.getRepository(Gpu);

    // Read the JSON file
    const gpuDataPath = path.join(__dirname, 'seeds', 'gpus.json');
    const gpuData = JSON.parse(fs.readFileSync(gpuDataPath, 'utf8'));

    console.log(`Found ${gpuData.length} GPUs to seed.`);

    // Upsert Strategy (Prevents errors if you run seed twice)
    // We check if the 'slug' exists. If so, we update; if not, we insert.
    for (const gpu of gpuData) {
        const existing = await gpuRepository.findOneBy({ slug: gpu.slug });

        if (existing) {
            console.log(`   - Updating ${gpu.name}`);
            await gpuRepository.update(existing.id, gpu);
        } else {
            console.log(`   - Creating ${gpu.name}`);
            await gpuRepository.save(gpu);
        }
    }

    console.log('✅ Seeding complete!');
    await AppDataSource.destroy();
}

seed().catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
});
