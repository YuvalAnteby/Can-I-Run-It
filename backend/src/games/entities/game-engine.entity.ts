import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('game_engines')
export class GameEngine {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    version: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
