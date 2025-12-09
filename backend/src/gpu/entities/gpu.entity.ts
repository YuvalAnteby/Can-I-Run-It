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
    @ApiProperty()
    id: number;

    @Column({ unique: true })
    @ApiProperty()
    slug: string;

    @Column()
    @ApiProperty()
    name: string;

    @Column({
        type: 'enum',
        enum: GpuBrand,
    })
    @ApiProperty()
    manufacturer: GpuBrand;

    @Column()
    @ApiProperty()
    vram_gb: number;

    @Column({ nullable: true })
    @ApiProperty()
    cuda_cores: number;

    @Column({ default: 0 })
    @ApiProperty()
    tensor_cores: number;

    @Column({ nullable: true })
    @ApiProperty()
    base_clock_mhz: number;

    @Column({ nullable: true })
    @ApiProperty()
    boost_clock_mhz: number;

    @Column({ nullable: true })
    @ApiProperty()
    memory_bus_width: number;

    @Column('jsonb', { default: {} })
    @ApiProperty()
    benchmarks: Record<string, number>;

    @Column({ type: 'date', nullable: true })
    @ApiProperty()
    release_date: string;

    @CreateDateColumn()
    @ApiProperty()
    created_at: Date;

    @UpdateDateColumn()
    @ApiProperty()
    updated_at: Date;
}
