import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum CpuBrand {
    AMD = 'amd',
    INTEL = 'intel',
}

@Entity('cpus')
export class Cpu {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the CPU',
        example: 1,
    })
    id: number;

    @Column({ unique: true, length: 100 })
    @ApiProperty({
        description: 'The slug of the CPU',
        example: 'ryzen-r5-3600',
    })
    slug: string;

    @Column({ length: 100 })
    @ApiProperty({
        description: 'The name of the CPU',
        example: 'Ryzen 5 3600',
    })
    name: string;

    @Column({
        type: 'enum',
        enum: CpuBrand,
    })
    @ApiProperty({
        description: 'The manufacturer of the CPU',
        enum: CpuBrand,
        example: CpuBrand.AMD,
    })
    manufacturer: CpuBrand;

    // -- Specs --
    @Column('int')
    @ApiProperty({ description: 'The number of cores', example: 6 })
    cores: number;

    @Column('int')
    @ApiProperty({ description: 'The number of threads', example: 12 })
    threads: number;

    // Using 'float' (maps to double precision usually) for clock speeds
    @Column('float')
    @ApiProperty({ description: 'The base clock speed in GHz', example: 3.6 })
    base_clock_ghz: number;

    @Column('float', { nullable: true })
    @ApiProperty({
        description: 'The boost clock speed in GHz',
        example: 4.2,
        nullable: true,
    })
    boost_clock_ghz: number;

    @Column('int', { nullable: true })
    @ApiProperty({
        description: 'The L3 cache size in MB',
        example: 32,
        nullable: true,
    })
    l3_cache_mb: number;

    // -- Flexible Data --
    // 'jsonb' is specific to Postgres and allows the GIN indexing you requested
    @Index('idx_cpus_benchmarks', { synchronize: false })
    @Column('jsonb', { default: {} })
    @ApiProperty({
        description: 'The benchmarks of the CPU',
        example: { passmark: 17800 },
    })
    benchmarks: Record<string, number>;

    // -- Timestamps --
    @CreateDateColumn({ name: 'created_at' })
    @ApiProperty({ description: 'The date and time the CPU was created' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    @ApiProperty({ description: 'The date and time the CPU was last updated' })
    updatedAt: Date;
}
