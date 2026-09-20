import { ClientCpuDto } from './cpu.types';
import { ClientGpuDto } from './gpu.types';

export type GameStatus = 'pending_approval' | 'published';

export interface PublicAttributionDto {
  source: 'rawg' | 'pcgamingwiki';
  label: 'RAWG' | 'PCGamingWiki';
  url: string;
}

export interface LocalGameSearchResult {
  source: 'local';
  id: number;
  slug: string;
  name: string;
  coverImageUrl: string | null;
}

export interface RawgGameSearchResult {
  source: 'rawg';
  rawgId: number;
  name: string;
  coverImageUrl: string | null;
  rawgUrl: string;
}

export type GameSearchResult = LocalGameSearchResult | RawgGameSearchResult;

export interface GameDiscoveryResponse {
  data: GameSearchResult[];
  rawgAvailable: boolean;
}

export interface RawgSelectionResponse {
  id: number;
  slug: string;
  status: GameStatus;
}

export interface ClientGameRequirementDto {
  tier: string;
  description: string | null;
  cpu: ClientCpuDto | null;
  gpu: ClientGpuDto | null;
  ramGb: number;
  vramGb: number | null;
  storageGb: number | null;
  requiresSsd: boolean;
  resolutionWidth: number;
  resolutionHeight: number;
  targetFps: number;
  notes: string | null;
}

export interface ClientGameDto {
  id: number;
  slug: string;
  name: string;
  status: GameStatus;
  /** Full URL or relative path to the cover image. Null until the games backend is ready. */
  coverImageUrl: string | null;
  releaseDate: string | null; // ISO date string, e.g. "2025-05-22"
  developer: string | null;
  publisher: string | null;
  genre: string | null;
  description: string | null;
  tags: string[];
  supportsRayTracing: boolean;
  supportsDlss: boolean;
  supportsFsr: boolean;
  supportsXeSS: boolean;
  isTrending: boolean;
  trendingRank: number | null;
  requirements: ClientGameRequirementDto[];
  attributions?: PublicAttributionDto[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface PaginatedGamesResult {
  data: ClientGameDto[];
  meta: PaginationMeta;
}
