import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { GameEngine } from '../games/entities/game-engine.entity';
import { Gpu } from '../gpu/entities/gpu.entity';

dotenv.config();

// Setup a temporary connection strictly for seeding
const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'username',
    password: process.env.POSTGRES_PASSWORD || 'changeme',
    database: process.env.POSTGRES_DB || 'myciridb',
    entities: [Gpu, Cpu, Game, GameEngine],
    synchronize: false,
});

// Define types for incoming JSON data
type SeedGpu = Partial<Gpu>;
type SeedGame = Partial<Game>;

async function seed() {
    await AppDataSource.initialize();
    console.log('Database connected for seeding...');

    // --- GPU Seeding ---
    const gpuRepository = AppDataSource.getRepository(Gpu);
    const gpuDataPath = path.join(__dirname, 'seeds', 'gpus.json');
    if (fs.existsSync(gpuDataPath)) {
        const gpuData = JSON.parse(
            fs.readFileSync(gpuDataPath, 'utf8'),
        ) as SeedGpu[];
        console.log(`Found ${gpuData.length} GPUs to seed.`);
        for (const gpu of gpuData) {
            const existing = await gpuRepository.findOneBy({ slug: gpu.slug });
            if (existing) {
                console.log(`   - Updating GPU: ${gpu.name}`);
                await gpuRepository.update(existing.id, gpu);
            } else {
                console.log(`   - Creating GPU: ${gpu.name}`);
                await gpuRepository.save(gpu);
            }
        }
    }

    // --- Game Seeding ---
    const gameRepository = AppDataSource.getRepository(Game);
    const gameDataPath = path.join(__dirname, 'seeds', 'games.json');
    if (fs.existsSync(gameDataPath)) {
        const gameData = JSON.parse(
            fs.readFileSync(gameDataPath, 'utf8'),
        ) as SeedGame[];
        console.log(`Found ${gameData.length} games to seed.`);
        for (const game of gameData) {
            const existing = await gameRepository.findOneBy({
                slug: game.slug,
            });
            if (existing) {
                console.log(`   - Updating Game: ${game.name}`);
                await gameRepository.update(existing.id, game);
            } else {
                console.log(`   - Creating Game: ${game.name}`);
                await gameRepository.save(game);
            }
        }
    }

    console.log('✅ Seeding complete!');
    await AppDataSource.destroy();
}

seed().catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
});
