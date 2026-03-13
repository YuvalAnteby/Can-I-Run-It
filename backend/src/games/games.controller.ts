import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClientGameDto } from './dto/client-game.dto';
import { GamesService } from './games.service';

@ApiTags('games')
@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    @Get('mock')
    @ApiOperation({ summary: 'Get all mock games' })
    @ApiOkResponse({ type: [ClientGameDto] })
    async getMockGames(): Promise<ClientGameDto[]> {
        return this.gamesService.getMockGames();
    }

    @Get('mock/search')
    @ApiOperation({ summary: 'Search mock games by name' })
    @ApiOkResponse({ type: [ClientGameDto] })
    async searchMockGames(@Query('q') q: string): Promise<ClientGameDto[]> {
        return this.gamesService.searchMockGames(q || '');
    }
}
