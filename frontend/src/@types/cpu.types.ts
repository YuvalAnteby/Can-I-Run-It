/**
 * Shared types for the CPU domain — mirrors ClientCpuDto from the backend.
 * Source of truth: backend/src/cpu/dto/client-cpu-dto.ts
 */

export type CpuManufacturer = 'AMD' | 'Intel';

export interface ClientCpuDto {
  id: number;
  slug: string;
  name: string;
  manufacturer: CpuManufacturer;
  tdp_watts: number | null;
  release_year: number | null;
  benchmarks?: Record<string, number>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface PaginatedCpusResult {
  data: ClientCpuDto[];
  meta: PaginationMeta;
}
