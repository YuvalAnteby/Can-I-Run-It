import { ClientCpuDto } from './cpu.types';
import { ClientGpuDto } from './gpu.types';

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
  /** Full URL or relative path to the cover image. Null until the games backend is ready. */
  coverImageUrl: string | null;
  releaseDate: string | null; // ISO date string, e.g. "2025-05-22"
  developer: string | null;
  publisher: string | null;
  genre: string | null;
  description: string | null;
  tags: string[] | null;
  supportsRayTracing: boolean;
  supportsDlss: boolean;
  supportsFsr: boolean;
  supportsXeSS: boolean;
  isTrending: boolean;
  trendingRank: number | null;
  requirements?: ClientGameRequirementDto[];
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
