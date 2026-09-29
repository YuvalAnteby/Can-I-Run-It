import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { Cpu } from '../../cpu/entities/cpu.entity';
import { Game } from '../../games/entities/game.entity';
import { Gpu } from '../../gpu/entities/gpu.entity';

export enum SettingPreset {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    ULTRA = 'ultra',
}

export enum UpscalerType {
    OFF = 'off',
    DLSS = 'DLSS',
    FSR = 'FSR',
    XESS = 'XeSS',
}

export enum UpscalerQualityMode {
    QUALITY = 'quality',
    BALANCED = 'balanced',
    PERFORMANCE = 'performance',
    ULTRA_PERFORMANCE = 'ultra_performance',
}

@Entity('performance_records')
export class PerformanceRecord {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the performance record',
        example: 1,
    })
    id: number;

    @ManyToOne(() => Game)
    @JoinColumn({ name: 'game_id' })
    @ApiProperty({ type: () => Game })
    game: Game;

    @ManyToOne(() => Gpu)
    @JoinColumn({ name: 'gpu_id' })
    @ApiProperty({ type: () => Gpu })
    gpu: Gpu;

    @ManyToOne(() => Cpu)
    @JoinColumn({ name: 'cpu_id' })
    @ApiProperty({ type: () => Cpu })
    cpu: Cpu;

    @Column({ type: 'int', name: 'ram_gb' })
    @ApiProperty({
        description: 'The RAM in GB used during the benchmark',
        example: 16,
    })
    ramGb: number;

    @Column({ type: 'int', name: 'ram_mhz', nullable: true })
    @ApiProperty({
        description: 'The RAM frequency in MHz',
        example: 3200,
        nullable: true,
    })
    ramMhz: number | null;

    @Column({ type: 'int', name: 'res_width' })
    @ApiProperty({ description: 'The resolution width', example: 1920 })
    resolutionWidth: number;

    @Column({ type: 'int', name: 'res_height' })
    @ApiProperty({ description: 'The resolution height', example: 1080 })
    resolutionHeight: number;

    @Column({
        type: 'enum',
        enum: SettingPreset,
    })
    @ApiProperty({
        description: 'The settings preset used',
        enum: SettingPreset,
        example: SettingPreset.ULTRA,
    })
    settings: SettingPreset;

    @Column({
        type: 'enum',
        enum: UpscalerType,
        default: UpscalerType.OFF,
    })
    @ApiProperty({
        description: 'The upscaler used',
        enum: UpscalerType,
        example: UpscalerType.OFF,
    })
    upscaler: UpscalerType;

    @Column({
        type: 'enum',
        enum: UpscalerQualityMode,
        name: 'upscaler_quality',
        nullable: true,
    })
    @ApiProperty({
        description: 'The upscaler quality mode',
        enum: UpscalerQualityMode,
        nullable: true,
        example: UpscalerQualityMode.QUALITY,
    })
    upscalerQuality: UpscalerQualityMode | null;

    @Column({ type: 'float', name: 'fps_avg' })
    @ApiProperty({ description: 'The average FPS', example: 75.5 })
    fpsAvg: number;

    @Column({ type: 'float', name: 'fps_1_percent_low', nullable: true })
    @ApiProperty({
        description: 'The 1% low FPS',
        example: 58.2,
        nullable: true,
    })
    fps1PercentLow: number | null;

    @Column({ type: 'boolean', default: false })
    @ApiProperty({ description: 'Whether the record is verified' })
    verified: boolean;

    @Column({ type: 'varchar', length: 50, default: 'measured' })
    source: string;

    @Column({ type: 'text', name: 'source_url', nullable: true })
    @ApiProperty({
        description: 'The source URL of the benchmark data',
        example: 'https://www.youtube.com/watch?v=...',
        nullable: true,
    })
    sourceUrl: string | null;

    @CreateDateColumn({ name: 'created_at' })
    @ApiProperty({ description: 'The date and time the record was created' })
    createdAt: Date;
}
