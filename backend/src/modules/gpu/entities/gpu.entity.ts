import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum GpuBrand {
    NVIDIA = 'Nvidia',
    AMD = 'AMD',
    INTEL = 'Intel',
}

/**
 * Entity representing a Graphics card (GPU).
 */
@Entity('gpus')
export class Gpu {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the GPU',
        example: 1,
    })
    id: number;

    @Column({ unique: true, length: 100 })
    @ApiProperty({
        description: 'The slug of the GPU',
        example: 'nvidia-geforce-rtx-4090',
    })
    slug: string;

    @Column({ length: 100 })
    @ApiProperty({
        description: 'The name of the GPU',
        example: 'GeForce RTX 4090',
    })
    name: string;

    @Column({
        type: 'enum',
        enum: GpuBrand,
    })
    @ApiProperty({
        description: 'The manufacturer of the GPU',
        enum: GpuBrand,
        example: GpuBrand.NVIDIA,
    })
    manufacturer: GpuBrand;

    @Column('int')
    @ApiProperty({ description: 'The VRAM of the GPU in GB', example: 24 })
    vram_gb: number;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The number of shading units of the GPU',
        example: 16384,
    })
    shading_units: number;

    @Column('int', { default: 0 })
    @ApiProperty({
        description: 'The number of Tensor cores of the GPU',
        example: 512,
    })
    tensor_cores: number;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The base clock of the GPU in MHz',
        example: 2235,
    })
    base_clock_mhz: number;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The boost clock of the GPU in MHz',
        example: 2520,
    })
    boost_clock_mhz: number;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The memory bus width of the GPU in bits',
        example: 384,
    })
    memory_bus_width: number;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The TDP of the GPU in Watts',
        example: 450,
    })
    tdp_watts: number;

    @Column('jsonb', { default: {} })
    @ApiProperty({
        description: 'The benchmarks of the GPU',
        example: { '3dmark-time-spy': 26000 },
    })
    benchmarks: Record<string, number>;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The release year of the GPU',
        example: 2022,
    })
    release_year: number;

    @CreateDateColumn({ name: 'created_at' })
    @ApiProperty({
        description: 'The date and time the GPU was created',
        example: '2023-01-01T00:00:00.000Z',
    })
    created_at: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    @ApiProperty({
        description: 'The date and time the GPU was last updated',
        example: '2023-01-01T00:00:00.000Z',
    })
    updated_at: Date;
}
