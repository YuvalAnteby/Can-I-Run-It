import type { ConfirmChannel } from 'amqplib';

export type GameStatus = 'pending_approval' | 'published' | 'rejected';

export type EnrichmentStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type MetadataSource =
    | 'rawg'
    | 'pcgamingwiki'
    | 'admin'
    | 'seed'
    | 'default';

export interface FieldProvenance {
    source: MetadataSource;
    sourceUrl: string | null;
    extractedBy: 'gemini' | null;
}

export type MetadataProvenance = Record<string, FieldProvenance>;

export interface GameEnrichmentMessage {
    gameId: number;
}

export const GAME_ENRICHMENT_QUEUE = 'game.enrichment';
export const GAME_ENRICHMENT_RETRY_QUEUE = 'game.enrichment.retry';
export const GAME_ENRICHMENT_DEAD_QUEUE = 'game.enrichment.dead';
export const GAME_ENRICHMENT_RETRY_TTL_MS = 60_000;

export async function assertGameEnrichmentTopology(
    channel: ConfirmChannel,
): Promise<void> {
    await channel.assertQueue(GAME_ENRICHMENT_DEAD_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {},
    });
    await channel.assertQueue(GAME_ENRICHMENT_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': GAME_ENRICHMENT_DEAD_QUEUE,
        },
    });
    await channel.assertQueue(GAME_ENRICHMENT_RETRY_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
            'x-message-ttl': GAME_ENRICHMENT_RETRY_TTL_MS,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': GAME_ENRICHMENT_QUEUE,
        },
    });
}

export function canTransitionGame(from: GameStatus, to: GameStatus): boolean {
    return (
        from === 'pending_approval' && (to === 'published' || to === 'rejected')
    );
}
