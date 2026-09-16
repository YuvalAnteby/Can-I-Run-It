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

export function canTransitionGame(from: GameStatus, to: GameStatus): boolean {
    return (
        from === 'pending_approval' && (to === 'published' || to === 'rejected')
    );
}
