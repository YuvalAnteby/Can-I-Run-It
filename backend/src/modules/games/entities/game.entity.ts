import { ApiProperty } from '@nestjs/swagger';
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { GameEngine } from './game-engine.entity';
import { GameRequirement } from './game-requirement.entity';

@Entity('games')
export class Game {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the game',
        example: 1,
    })
    id: number;

    @Column({ type: 'varchar', length: 100, unique: true })
    @ApiProperty({
        description: 'The URL-friendly slug of the game',
        example: 'cyberpunk-2077',
    })
    slug: string;

    @Column({ type: 'varchar', length: 200 })
    @ApiProperty({
        description: 'The display name of the game',
        example: 'Cyberpunk 2077',
    })
    name: string;

    @ManyToOne(() => GameEngine, { nullable: true })
    @JoinColumn({ name: 'game_engine_id' })
    @ApiProperty({ type: () => GameEngine, nullable: true })
    gameEngine: GameEngine | null;

    @OneToMany(() => GameRequirement, (requirement) => requirement.game)
    @ApiProperty({
        type: () => [GameRequirement],
        description: 'The requirements of the game',
    })
    requirements: GameRequirement[];

    @Column({ type: 'varchar', length: 200, nullable: true })
    @ApiProperty({
        description: 'The publisher of the game',
        example: 'CD PROJEKT RED',
        nullable: true,
    })
    publisher: string | null;

    @Column({ type: 'varchar', length: 200, nullable: true })
    @ApiProperty({
        description: 'The developer of the game',
        example: 'CD PROJEKT RED',
        nullable: true,
    })
    developer: string | null;

    @Column({ type: 'date', name: 'release_date', nullable: true })
    @ApiProperty({
        description: 'The release date of the game',
        example: '2020-12-10',
        nullable: true,
    })
    releaseDate: Date | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    @ApiProperty({
        description: 'The genre of the game',
        example: 'Action RPG',
        nullable: true,
    })
    genre: string | null;

    @Column({ type: 'text', nullable: true })
    @ApiProperty({
        description: 'The description of the game',
        example:
            'Cyberpunk 2077 is an open-world, action-adventure story set in Night City...',
        nullable: true,
    })
    description: string | null;

    @Column({ type: 'text', array: true, nullable: true })
    @ApiProperty({
        description: 'The tags associated with the game',
        example: ['ray-tracing', 'open-world', 'cpu-heavy'],
        nullable: true,
    })
    tags: string[] | null;

    @Column({ type: 'boolean', name: 'supports_ray_tracing', default: false })
    @ApiProperty({ description: 'Whether the game supports ray tracing' })
    supportsRayTracing: boolean;

    @Column({ type: 'boolean', name: 'supports_dlss', default: false })
    @ApiProperty({ description: 'Whether the game supports NVIDIA DLSS' })
    supportsDlss: boolean;

    @Column({ type: 'boolean', name: 'supports_fsr', default: false })
    @ApiProperty({ description: 'Whether the game supports AMD FSR' })
    supportsFsr: boolean;

    @Column({ type: 'boolean', name: 'supports_xess', default: false })
    @ApiProperty({ description: 'Whether the game supports Intel XeSS' })
    supportsXeSS: boolean;

    @Column({ type: 'text', name: 'cover_image_url', nullable: true })
    @ApiProperty({
        description: 'The URL of the cover image',
        nullable: true,
    })
    coverImageUrl: string | null;

    @Column({ type: 'boolean', name: 'is_trending', default: false })
    @ApiProperty({ description: 'Whether the game is currently trending' })
    isTrending: boolean;

    @Column({ type: 'integer', name: 'trending_rank', nullable: true })
    @ApiProperty({
        description: 'The rank of the game in trending list',
        example: 1,
        nullable: true,
    })
    trendingRank: number | null;

    @CreateDateColumn({ name: 'created_at' })
    @ApiProperty({ description: 'The date and time the game was created' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    @ApiProperty({ description: 'The date and time the game was last updated' })
    updatedAt: Date;
}
