import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('game_engines')
export class GameEngine {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the game engine',
        example: 1,
    })
    id: number;

    @Column({ type: 'varchar', length: 100 })
    @ApiProperty({
        description: 'The name of the game engine',
        example: 'Unreal Engine',
    })
    name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    @ApiProperty({
        description: 'The version of the game engine',
        example: '5.1',
        nullable: true,
    })
    version: string | null;

    @CreateDateColumn({ name: 'created_at' })
    @ApiProperty({
        description: 'The date and time the game engine was created',
    })
    createdAt: Date;
}
