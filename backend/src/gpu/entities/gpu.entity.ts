import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum HardwareBrand {
    NVIDIA = 'Nvidia',
    AMD = 'AMD',
    INTEL = 'Intel',
}

@Entity('gpus')
export class Gpu {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    slug: string;

    @Column()
    name: string;

    @Column({
        type: 'enum',
        enum: HardwareBrand,
    })
    manufacturer: HardwareBrand;

    @Column()
    vram_gb: number;

    @Column({ nullable: true })
    cuda_cores: number;

    @Column({ default: 0 })
    tensor_cores: number;

    @Column({ nullable: true })
    base_clock_mhz: number;

    @Column({ nullable: true })
    boost_clock_mhz: number;

    @Column({ nullable: true })
    memory_bus_width: number;

    @Column('jsonb', { default: {} })
    benchmarks: Record<string, number>;

    @Column({ type: 'date', nullable: true })
    release_date: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
