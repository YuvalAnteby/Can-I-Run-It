/**
 * Shared types for the GPU domain — mirrors ClientGpuDto from the backend.
 * Source of truth: backend/src/modules/gpu/dto/client-gpu-dto.ts
 */

import type { PaginationMeta } from './cpu.types';

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

export interface PaginatedGpusResult {
  data: ClientGpuDto[];
  meta: PaginationMeta;
}
