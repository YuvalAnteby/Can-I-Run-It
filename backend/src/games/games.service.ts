import { Injectable, Logger } from '@nestjs/common';

import { ClientGameDto } from './dto/client-game.dto';
import { MOCK_GAMES } from './games.constants';

@Injectable()
export class GamesService {
    private readonly logger = new Logger(GamesService.name);

    constructor() {}

    async getMockGames(): Promise<ClientGameDto[]> {
        return Promise.resolve(MOCK_GAMES);
    }

    async searchMockGames(query: string): Promise<ClientGameDto[]> {
        if (!query) {
            return Promise.resolve([]);
        }
        const q = query.toLowerCase();
        return Promise.resolve(
            MOCK_GAMES.filter((g) => g.name.toLowerCase().includes(q)),
        );
    }
}
