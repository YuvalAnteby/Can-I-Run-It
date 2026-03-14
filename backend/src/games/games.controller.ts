import { Controller, Get, Param, Query, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { ClientGameDto } from './dto/client-game.dto';
import { FilterGameDto } from './dto/filter-game.dto';
import { GamesService } from './games.service';

@ApiTags('games')
@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    /* ── V1 Endpoints (Mock) ─────────────────────────────────── */

    @Get('mock')
    @Version('1')
    @ApiOperation({
        summary: 'Get all mock games',
        deprecated: true,
        description: 'Use v2/games instead for live database data.',
    })
    @ApiOkResponse({ type: [ClientGameDto] })
    async getMockGames(): Promise<ClientGameDto[]> {
        return this.gamesService.getMockGames();
    }

    @Get('mock/search')
    @Version('1')
    @ApiOperation({
        summary: 'Search mock games by name',
        deprecated: true,
        description: 'Use v2/games?search=... instead for live database data.',
    })
    @ApiOkResponse({ type: [ClientGameDto] })
    async searchMockGames(@Query('q') q: string): Promise<ClientGameDto[]> {
        return this.gamesService.searchMockGames(q || '');
    }

    /* ── V2 Endpoints (Database) ─────────────────────────────── */

    @Get()
    @Version('2')
    @ApiOperation({ summary: 'Get paginated games from database' })
    @ApiOkResponse({ type: PaginatedResult<ClientGameDto> })
    async getGames(
        @Query() filterDto: FilterGameDto,
    ): Promise<PaginatedResult<ClientGameDto>> {
        return this.gamesService.findPaged(filterDto);
    }

    @Get(':slug')
    @Version('2')
    @ApiOperation({ summary: 'Get a single game by slug' })
    @ApiOkResponse({ type: ClientGameDto })
    async getGameBySlug(@Param('slug') slug: string): Promise<ClientGameDto> {
        return this.gamesService.findBySlug(slug);
    }
}
