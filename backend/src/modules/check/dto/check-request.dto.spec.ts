import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CheckRequestDto } from './check-request.dto';
import { PendingCheckRequestDto } from './pending-check-request.dto';

it('requires hardware and settings on the published check request', async () => {
    const errors = await validate(
        plainToInstance(CheckRequestDto, { gameSlug: 'cyberpunk-2077' }),
    );

    expect(errors.map(({ property }) => property)).toEqual(
        expect.arrayContaining(['hardware', 'settings']),
    );
});

it('requires hardware and settings on the pending check request', async () => {
    const errors = await validate(plainToInstance(PendingCheckRequestDto, {}));

    expect(errors.map(({ property }) => property)).toEqual(
        expect.arrayContaining(['hardware', 'settings']),
    );
});
