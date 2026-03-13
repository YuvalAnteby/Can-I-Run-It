/** @type {ClientGameDto} */

/**
 * Shared types for the Games domain.
 *
 * TODO: Once the NestJS games module is built, replace these hand-rolled
 * interfaces with auto-generated DTOs imported from the backend (or a shared
 * types package). Keep field names in sync with the games table in
 * infra/init-scripts/03-games-schema.sql.
 */

export interface ClientGameDto {
  id: number;
  slug: string;
  name: string;
  /** Full URL or relative path to the cover image. Null until the games backend is ready. */
  coverImageUrl: string | null;
  releaseDate: string | null; // ISO date string, e.g. "2025-05-22"
  developer: string | null;
  publisher: string | null;
  supportsRayTracing: boolean;
  supportsDlss: boolean;
  supportsFsr: boolean;
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
