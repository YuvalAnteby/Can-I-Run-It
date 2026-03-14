/**
 * Shared types for the GPU domain — mirrors ClientGpuDto from the backend.
 * Source of truth: backend/src/gpu/dto/client-gpu-dto.ts
 */

export type GpuManufacturer = 'nvidia' | 'amd' | 'intel';

export interface ClientGpuDto {
  id: number;
  slug: string;
  name: string;
  manufacturer: GpuManufacturer;
  vram_gb: number;
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
