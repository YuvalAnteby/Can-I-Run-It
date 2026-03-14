import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    ApiExtraModels,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    getSchemaPath,
} from '@nestjs/swagger';
import { PaginatedResult } from 'src/common/dto/paginated-result.dto';

import { ClientGpuDto } from './dto/client-gpu-dto';
import { GpusFilterDto } from './dto/filter-gpu-dto';
import { GpuSearchDto } from './dto/search-gpu-dto';
import { GpuService } from './gpu.service';

@ApiTags('gpus')
@Controller('gpus')
@ApiExtraModels(PaginatedResult, ClientGpuDto)
export class GpuController {
    constructor(private readonly gpuService: GpuService) {}

    /**
     * Search for GPUs by name
     * @param searchDTO - The search parameters
     * @returns A list of GPUs matching the search query
     */
    @Get('search')
    @ApiOperation({ summary: 'Search for GPUs by name' })
    @ApiOkResponse({
        description: 'A list of GPUs matching the search query',
        type: [ClientGpuDto],
    })
    async searchByName(
        @Query() searchDTO: GpuSearchDto,
    ): Promise<ClientGpuDto[]> {
        return await this.gpuService.searchByName(searchDTO);
    }

    /**
     * Get a GPU by its slug
     * @param slug - The slug of the GPU
     * @returns The GPU with the given slug
     */
    @Get(':slug')
    @ApiOperation({ summary: 'Get a GPU by its slug' })
    @ApiParam({ name: 'slug', description: 'The slug of the GPU' })
    @ApiOkResponse({
        description: 'The GPU with the given slug',
        type: ClientGpuDto,
    })
    async findOne(@Param('slug') slug: string): Promise<ClientGpuDto> {
        return await this.gpuService.findOne(slug);
    }

    /**
     * Get a paginated list of GPUs
     * @param filterDTO - The filter and pagination parameters
     * @returns A paginated list of GPUs
     */
    @Get()
    @ApiOperation({ summary: 'Get a paginated list of GPUs' })
    @ApiOkResponse({
        description: 'A paginated list of GPUs',
        schema: {
            allOf: [
                { $ref: getSchemaPath(PaginatedResult) },
                {
                    properties: {
                        data: {
                            type: 'array',
                            items: { $ref: getSchemaPath(ClientGpuDto) },
                        },
                    },
                },
            ],
        },
    })
    async findAll(
        @Query() filterDTO: GpusFilterDto,
    ): Promise<PaginatedResult<ClientGpuDto>> {
        return await this.gpuService.findAll(filterDTO);
    }
}
