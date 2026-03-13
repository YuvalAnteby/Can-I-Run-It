import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { GameEngine } from './game-engine.entity';

@Entity('games')
export class Game {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 100, unique: true })
    slug: string;

    @Column({ type: 'varchar', length: 200 })
    name: string;

    @ManyToOne(() => GameEngine, { nullable: true })
    @JoinColumn({ name: 'game_engine_id' })
    gameEngine: GameEngine | null;

    @Column({ type: 'varchar', length: 200, nullable: true })
    publisher: string | null;

    @Column({ type: 'varchar', length: 200, nullable: true })
    developer: string | null;

    @Column({ type: 'date', name: 'release_date', nullable: true })
    releaseDate: Date | null;

    @Column({ type: 'boolean', name: 'supports_ray_tracing', default: false })
    supportsRayTracing: boolean;

    @Column({ type: 'boolean', name: 'supports_dlss', default: false })
    supportsDlss: boolean;

    @Column({ type: 'boolean', name: 'supports_fsr', default: false })
    supportsFsr: boolean;

    @Column({ type: 'text', name: 'cover_image_url', nullable: true })
    coverImageUrl: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
