import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const ALLOWED_SORT_FIELDS = [
    'name',
    'releaseDate',
    'developer',
    'publisher',
] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'] as const;
type SortOrder = (typeof ALLOWED_SORT_ORDERS)[number];

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
        enum: ALLOWED_SORT_FIELDS,
    })
    @IsOptional()
    @IsString()
    @IsIn(ALLOWED_SORT_FIELDS)
    sortBy?: SortField = 'releaseDate';

    @ApiPropertyOptional({
        description: 'The sort order (ASC or DESC)',
        example: 'DESC',
        enum: ALLOWED_SORT_ORDERS,
        default: 'DESC',
    })
    @IsOptional()
    @IsString()
    @IsIn(ALLOWED_SORT_ORDERS)
    sortOrder?: SortOrder = 'DESC';
}
