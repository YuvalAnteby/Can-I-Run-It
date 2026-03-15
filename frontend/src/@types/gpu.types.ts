/**
 * Shared types for the GPU domain — mirrors ClientGpuDto from the backend.
 * Source of truth: backend/src/gpu/dto/client-gpu-dto.ts
 */

export type GpuManufacturer = 'Nvidia' | 'AMD' | 'Intel';

export interface ClientGpuDto {
  id: number;
  slug: string;
  name: string;
  manufacturer: GpuManufacturer;
  vramGb: number;
  shadingUnits: number | null;
  tdpWatts: number | null;
  releaseYear: number | null;
  benchmarks?: Record<string, number>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface PaginatedGpusResult {
  data: ClientGpuDto[];
  meta: PaginationMeta;
}
