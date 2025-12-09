import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { GpuBrand } from '../entities/gpu.entity';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for filtering and paginating GPU results.
 */
export class GpusFilterDto {
    @IsOptional()
    @IsEnum(GpuBrand, { message: 'Manufacturer must be nvidia, amd, or intel' })
    @Transform(({ value }) => value?.toLowerCase())
    @ApiProperty()
    manufacturer?: GpuBrand;

    @IsOptional()
    @Type(() => Number)
    @Min(0)
    @ApiProperty()
    minVram?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty()
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty()
    limit?: number = 20;
}
