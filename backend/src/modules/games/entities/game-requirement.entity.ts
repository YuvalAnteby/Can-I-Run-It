import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';

import { Cpu } from '../../cpu/entities/cpu.entity';
import { Gpu } from '../../gpu/entities/gpu.entity';
import { Game } from './game.entity';

@Entity('game_requirements')
@Unique(['game', 'tier'])
export class GameRequirement {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the requirement',
        example: 1,
    })
    id: number;

    @ManyToOne(() => Game, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'game_id' })
    @ApiProperty({ type: () => Game })
    game: Game;

    @Column({ type: 'varchar', length: 50 })
    @ApiProperty({
        description: 'The tier of the requirement (e.g., minimum, recommended)',
        example: 'minimum',
    })
    tier: string;

    @Column({ type: 'text', nullable: true })
    @ApiProperty({
        description: 'Human readable explanation of what this tier targets',
        example: 'For 60fps at 1080p High settings',
        nullable: true,
    })
    description: string | null;

    @ManyToOne(() => Cpu, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'cpu_id' })
    @ApiProperty({ type: () => Cpu, nullable: true })
    cpu: Cpu | null;

    @ManyToOne(() => Gpu, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'gpu_id' })
    @ApiProperty({ type: () => Gpu, nullable: true })
    gpu: Gpu | null;

    @Column({ type: 'int', name: 'ram_gb' })
    @ApiProperty({ description: 'The required RAM in GB', example: 8 })
    ramGb: number;

    @Column({ type: 'int', name: 'vram_gb', nullable: true })
    @ApiProperty({
        description: 'The required VRAM in GB',
        example: 4,
        nullable: true,
    })
    vramGb: number | null;

    @Column({ type: 'int', name: 'storage_gb', nullable: true })
    @ApiProperty({
        description: 'The required storage space in GB',
        example: 50,
        nullable: true,
    })
    storageGb: number | null;

    @Column({ type: 'boolean', name: 'requires_ssd', default: false })
    @ApiProperty({ description: 'Whether an SSD is required' })
    requiresSsd: boolean;

    @Column({ type: 'int', name: 'resolution_width', default: 1920 })
    @ApiProperty({ description: 'The target resolution width', example: 1920 })
    resolutionWidth: number;

    @Column({ type: 'int', name: 'resolution_height', default: 1080 })
    @ApiProperty({ description: 'The target resolution height', example: 1080 })
    resolutionHeight: number;

    @Column({ type: 'int', name: 'target_fps', default: 30 })
    @ApiProperty({ description: 'The target FPS', example: 30 })
    targetFps: number;

    @Column({ type: 'text', nullable: true })
    @ApiProperty({
        description:
            'Soft requirements: DirectX version, OS, driver notes, etc.',
        nullable: true,
    })
    notes: string | null;
}
