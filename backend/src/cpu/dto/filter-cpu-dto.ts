import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CpuBrand } from '../entities/cpu.entity';

/**
 * DTO for filtering and paginating GPU results.
 */
export class CpuFilterDto {
    @ApiProperty({
        description: 'The manufacturer of the CPU (e.g., "intel", "amd")',
        required: false,
        enum: CpuBrand,
    })
    @IsOptional()
    @IsEnum(CpuBrand, { message: 'Manufacturer must be amd or intel' })
    @Transform(({ value }) => value?.toLowerCase())
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
