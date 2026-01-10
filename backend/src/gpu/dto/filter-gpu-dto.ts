import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { GpuBrand } from '../entities/gpu.entity';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for filtering and paginating GPU results.
 */
export class GpusFilterDto {
    @ApiProperty({
        description: 'The manufacturer of the GPU (e.g., "nvidia", "amd")',
        required: false,
        enum: GpuBrand,
    })
    @IsOptional()
    @IsEnum(GpuBrand, { message: 'Manufacturer must be nvidia, amd, or intel' })
    @Transform(({ value }) => value?.toLowerCase())
    manufacturer?: GpuBrand;

    @ApiProperty({
        description: 'The minimum VRAM of the GPU in GB',
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    @Min(0)
    minVram?: number;

    @ApiProperty({
        description: 'The page number for pagination',
        required: false,
        default: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiProperty({
        description: 'The number of items per page',
        required: false,
        default: 20,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 20;
}
