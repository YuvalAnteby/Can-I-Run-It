import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PaginatedResult } from 'src/common/dto/paginated-result.dto';

import { CpuService } from './cpu.service';
import { ClientCpuDto } from './dto/client-cpu-dto';
import { CpuFilterDto } from './dto/filter-cpu-dto';
import { CpuSearchDto } from './dto/search-cpu-dto';

@ApiTags('cpus')
@Controller('cpus')
export class CpuController {
    constructor(private readonly cpuService: CpuService) {}

    /**
     * Search for GPUs by name
     * @param searchDTO - The search parameters
     * @returns A list of GPUs matching the search query
     */
    @Get('search')
    @ApiOperation({ summary: 'Search for CPUs by name' })
    @ApiOkResponse({
        description: 'A list of CPUs matching the search query',
        type: [ClientCpuDto],
    })
    async searchByName(
        @Query() searchDTO: CpuSearchDto,
    ): Promise<ClientCpuDto[]> {
        return await this.cpuService.searchByName(searchDTO);
    }

    /**
     * Get a CPU by its slug
     * @param slug - The slug of the CPU
     * @returns The CPU with the given slug
     */
    @Get(':slug')
    @ApiOperation({ summary: 'Get a CPU by its slug' })
    @ApiParam({ name: 'slug', description: 'The slug of the CPU' })
    @ApiOkResponse({
        description: 'The CPU with the given slug',
        type: ClientCpuDto,
    })
    async findOne(@Param('slug') slug: string): Promise<ClientCpuDto> {
        return await this.cpuService.findOne(slug);
    }

    /**
     * Get a paginated list of CPUs
     * @param filterDTO - The filter and pagination parameters
     * @returns A paginated list of CPUs
     */
    @Get()
    @ApiOperation({ summary: 'Get a paginated list of CPUs' })
    @ApiOkResponse({
        description: 'A paginated list of CPUs',
        type: PaginatedResult<ClientCpuDto>,
    })
    async findAll(
        @Query() filterDTO: CpuFilterDto,
    ): Promise<PaginatedResult<ClientCpuDto>> {
        return await this.cpuService.findAll(filterDTO);
    }
}
