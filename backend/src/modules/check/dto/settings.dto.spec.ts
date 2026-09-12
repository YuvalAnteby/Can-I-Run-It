import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SettingsDto } from './settings.dto';

it('defaults an omitted target to 60 and accepts V1 settings', async () => {
    const dto = plainToInstance(SettingsDto, {
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        preset: 'high',
    });

    expect(dto.targetFps).toBe(60);
    expect(await validate(dto)).toHaveLength(0);
});

it('rejects an unsupported target FPS', async () => {
    const dto = plainToInstance(SettingsDto, {
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        targetFps: 75,
        preset: 'high',
    });

    expect(
        (await validate(dto)).some((error) => error.property === 'targetFps'),
    ).toBe(true);
});

it('rejects a null target FPS', async () => {
    const dto = plainToInstance(SettingsDto, {
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        targetFps: null,
        preset: 'high',
    });

    expect(
        (await validate(dto)).some((error) => error.property === 'targetFps'),
    ).toBe(true);
});
