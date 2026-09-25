import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GameIdParamsDto } from './game-id-params.dto';

describe('GameIdParamsDto', () => {
    it.each(['0', '-1'])('rejects non-positive game ID %s', async (id) => {
        const dto = plainToInstance(
            GameIdParamsDto,
            { id },
            { enableImplicitConversion: true },
        );

        await expect(validate(dto)).resolves.not.toHaveLength(0);
    });
});
