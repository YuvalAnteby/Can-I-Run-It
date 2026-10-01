export type GameStatus = 'pending_approval' | 'published' | 'rejected';

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
