import {
    BadRequestException,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UseGuards,
    Version,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { ClientGameDto } from './dto/client-game.dto';
import { DiscoverGamesDto } from './dto/discover-games.dto';
import { FilterGameDto } from './dto/filter-game.dto';
import { GameIdParamsDto } from './dto/game-id-params.dto';
import {
    GameDiscoveryResponse,
    GamesService,
    SelectedRawgGame,
} from './games.service';

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

    @Get('discover')
    @Version('2')
    @UseGuards(CheckRateLimitGuard)
    @ApiOperation({ summary: 'Discover local and RAWG games' })
    @ApiOkResponse({ description: 'Mixed local and RAWG search results' })
    async discoverGames(
        @Query() dto: DiscoverGamesDto,
    ): Promise<GameDiscoveryResponse> {
        const query = typeof dto?.q === 'string' ? dto.q.trim() : '';
        if (!query || query.length > 100) {
            throw new BadRequestException(
                'Search query must be between 1 and 100 characters',
            );
        }
        return this.gamesService.discover(query);
    }

    @Post('rawg/:rawgId/select')
    @Version('2')
    @UseGuards(CheckRateLimitGuard)
    @ApiOperation({ summary: 'Select a RAWG game for enrichment' })
    @ApiOkResponse({ description: 'Selected game identity' })
    async selectRawgGame(
        @Param('rawgId', ParseIntPipe) rawgId: number,
    ): Promise<SelectedRawgGame> {
        return this.gamesService.selectRawgGame(rawgId);
    }

    @Get(':slug')
    @Version('2')
    @ApiOperation({ summary: 'Get a single game by slug' })
    @ApiOkResponse({ type: ClientGameDto })
    async getGameBySlug(@Param('slug') slug: string): Promise<ClientGameDto> {
        return this.gamesService.findBySlug(slug);
    }

    @Get('pending/:id')
    @Version('2')
    @ApiOperation({ summary: 'Get a selected pending game by internal ID' })
    @ApiOkResponse({ type: ClientGameDto })
    async getPendingGame(
        @Param() { id }: GameIdParamsDto,
    ): Promise<ClientGameDto> {
        return this.gamesService.findPendingPageById(id);
    }
}
