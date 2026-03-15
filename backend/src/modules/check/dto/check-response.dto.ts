import { ApiProperty } from '@nestjs/swagger';

export class CheckResponseDto {
    @ApiProperty({
        description: 'The state of compatibility (can, barely, cant)',
        example: 'can',
    })
    state: 'can' | 'barely' | 'cant';

    @ApiProperty({
        description: 'The summary verdict message',
        example: 'Runs well',
    })
    verdict: string;

    @ApiProperty({
        description: 'The detailed sub-verdict message',
        example: 'Meets recommended requirements',
    })
    sub: string;

    @ApiProperty({
        description: 'Whether the GPU meets requirements',
        example: true,
    })
    gpuPass: boolean;

    @ApiProperty({
        description: 'Whether the CPU meets requirements',
        example: true,
    })
    cpuPass: boolean;

    @ApiProperty({
        description: 'Whether the RAM meets requirements',
        example: true,
    })
    ramPass: boolean;

    @ApiProperty({
        description: 'Estimated FPS for different presets',
        example: { low: 100, med: 80, high: 60, ultra: 45 },
    })
    fps: {
        low: number;
        med: number;
        high: number;
        ultra: number;
    };
}
