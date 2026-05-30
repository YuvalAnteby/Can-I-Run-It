import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { CpuBrand } from '../entities/cpu.entity';

/**
 * DTO for filtering and paginating GPU results.
 */
export class CpuFilterDto {
    @ApiProperty({
        description: 'The manufacturer of the CPU (e.g., "Intel", "AMD")',
        required: false,
        enum: CpuBrand,
    })
    @IsOptional()
    @IsEnum(CpuBrand, { message: 'Manufacturer must be AMD or Intel' })
    manufacturer?: CpuBrand;

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
