import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO for filtering, searching, and paginating game results.
 */
export class FilterGameDto {
    @ApiPropertyOptional({
        description: 'Search by game name (case-insensitive)',
        example: 'Cyberpunk',
    })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'The number of items to return per page',
        example: 10,
        default: 10,
        minimum: 1,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    limit?: number = 10;

    @ApiPropertyOptional({
        description: 'The page number for pagination',
        example: 1,
        default: 1,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @ApiPropertyOptional({
        description: 'The field to sort results by',
        example: 'releaseDate',
        default: 'releaseDate',
    })
    @IsOptional()
    @IsString()
    sortBy?: string = 'releaseDate';

    @ApiPropertyOptional({
        description: 'The sort order (ASC or DESC)',
        example: 'DESC',
        enum: ['ASC', 'DESC'],
        default: 'DESC',
    })
    @IsOptional()
    @IsString()
    sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
