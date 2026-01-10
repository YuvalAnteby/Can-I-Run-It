import { ApiProperty } from '@nestjs/swagger';
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum GpuBrand {
    NVIDIA = 'nvidia',
    AMD = 'amd',
    INTEL = 'intel',
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

    @Column({ unique: true })
    @ApiProperty({
        description: 'The slug of the GPU',
        example: 'nvidia-geforce-rtx-4090',
    })
    slug: string;

    @Column()
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

    @Column()
    @ApiProperty({ description: 'The VRAM of the GPU in GB', example: 24 })
    vram_gb: number;

    @Column({ nullable: true })
    @ApiProperty({
        description: 'The number of CUDA cores of the GPU',
        example: 16384,
    })
    cuda_cores: number;

    @Column({ default: 0 })
    @ApiProperty({
        description: 'The number of Tensor cores of the GPU',
        example: 512,
    })
    tensor_cores: number;

    @Column({ nullable: true })
    @ApiProperty({
        description: 'The base clock of the GPU in MHz',
        example: 2235,
    })
    base_clock_mhz: number;

    @Column({ nullable: true })
    @ApiProperty({
        description: 'The boost clock of the GPU in MHz',
        example: 2520,
    })
    boost_clock_mhz: number;

    @Column({ nullable: true })
    @ApiProperty({
        description: 'The memory bus width of the GPU in bits',
        example: 384,
    })
    memory_bus_width: number;

    @Column('jsonb', { default: {} })
    @ApiProperty({
        description: 'The benchmarks of the GPU',
        example: { '3dmark-time-spy': 26000 },
    })
    benchmarks: Record<string, number>;

    @Column({ type: 'date', nullable: true })
    @ApiProperty({
        description: 'The release date of the GPU',
        example: '2022-10-12',
    })
    release_date: string;

    @CreateDateColumn()
    @ApiProperty({
        description: 'The date and time the GPU was created',
        example: '2023-01-01T00:00:00.000Z',
    })
    created_at: Date;

    @UpdateDateColumn()
    @ApiProperty({
        description: 'The date and time the GPU was last updated',
        example: '2023-01-01T00:00:00.000Z',
    })
    updated_at: Date;
}
