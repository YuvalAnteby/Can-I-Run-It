import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

// Matching your Postgres ENUM exactly
export enum HardwareBrand {
    NVIDIA = 'Nvidia',
    AMD = 'AMD',
    INTEL = 'Intel',
}

@Entity('cpus')
export class Cpu {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true, length: 100 })
    slug: string;

    @Column({ length: 100 })
    name: string;

    @Column({
        type: 'enum',
        enum: HardwareBrand,
    })
    manufacturer: HardwareBrand;

    // -- Specs --
    @Column('int')
    cores: number;

    @Column('int')
    threads: number;

    // Using 'float' (maps to double precision usually) for clock speeds
    @Column('float')
    base_clock_ghz: number;

    @Column('float', { nullable: true })
    boost_clock_ghz: number;

    @Column('int', { nullable: true })
    l3_cache_mb: number;

    // -- Flexible Data --
    // 'jsonb' is specific to Postgres and allows the GIN indexing you requested
    @Index('idx_cpus_benchmarks', { synchronize: false })
    @Column('jsonb', { default: {} })
    benchmarks: Record<string, number>;

    // -- Timestamps --
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
