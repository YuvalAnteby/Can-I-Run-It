import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for searching GPUs based on a query string.
 */
export class GpuSearchDto {
    @ApiProperty({
        description: 'The search term (e.g., "4090", "Ryzen 5")',
        required: true,
        minLength: 2,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(2, { message: 'Search term must be at least 2 characters long' })
    @Transform(({ value }) => {
        // 1. Trim whitespaces
        // 2. Remove all '%' characters
        // 3. Remove all '_' characters ('_' is a wildcard in SQL)
        return value?.trim().replace(/[%_]/g, '');
    })
    q: string;
}
