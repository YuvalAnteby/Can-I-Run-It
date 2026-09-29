import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FilterGameDto } from './filter-game.dto';

it('bounds public search length and pagination', async () => {
    const errors = await validate(
        plainToInstance(FilterGameDto, {
            search: 'x'.repeat(101),
            page: 10001,
        }),
    );
    expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['search', 'page']),
    );
    expect(
        await validate(
            plainToInstance(FilterGameDto, { search: 'Cyberpunk', page: 1 }),
        ),
    ).toHaveLength(0);
});
