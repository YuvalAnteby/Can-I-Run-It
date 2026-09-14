import { ApiProperty } from '@nestjs/swagger';
import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

import type { EnrichmentStatus } from '../game-lifecycle.contract';
import { Game } from './game.entity';

@Entity('game_enrichment_jobs')
@Unique('game_enrichment_jobs_game_id_key', ['game'])
@Check(
    'game_enrichment_jobs_status_check',
    `status IN ('queued', 'processing', 'completed', 'failed')`,
)
@Check('game_enrichment_jobs_attempts_check', 'attempts >= 0')
export class GameEnrichmentJob {
    @PrimaryGeneratedColumn()
    @ApiProperty({
        description: 'The unique identifier of the job',
        example: 1,
    })
    id: number;

    @ManyToOne(() => Game, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'game_id' })
    @ApiProperty({ type: () => Game })
    game: Game;

    @Column({ type: 'varchar', length: 20, default: 'queued' })
    @ApiProperty({
        description: 'The current enrichment job status',
        example: 'queued',
    })
    status: EnrichmentStatus;

    @Column({
        type: 'text',
        array: true,
        default: () => "'{}'::text[]",
    })
    @ApiProperty({
        description: 'Persisted metadata field paths still missing',
        example: ['requirements.minimum.ramGb'],
    })
    missingFields: string[];

    @Column({ type: 'text', nullable: true })
    @ApiProperty({
        description: 'The most recent enrichment error',
        nullable: true,
    })
    error: string | null;

    @Column({ type: 'integer', default: 0 })
    @ApiProperty({ description: 'The number of worker attempts', example: 0 })
    attempts: number;

    @Column({ type: 'uuid', name: 'claim_token', nullable: true })
    @ApiProperty({
        description: 'The current worker claim token',
        nullable: true,
    })
    claimToken: string | null;

    @Column({ type: 'timestamptz', name: 'claimed_at', nullable: true })
    @ApiProperty({
        description: 'When the current worker claim was made',
        nullable: true,
    })
    claimedAt: Date | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    @ApiProperty({ description: 'When the job was created' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
    @ApiProperty({ description: 'When the job was last updated' })
    updatedAt: Date;
}
