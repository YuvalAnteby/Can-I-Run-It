import { ApiProperty } from '@nestjs/swagger';

import type { TargetFps } from './settings.dto';
import { TARGET_FPS_VALUES } from './settings.dto';

export type CheckState = 'can' | 'cant' | 'insufficient';
export type CheckVerdict =
    | 'Can run'
    | "Can't run"
    | 'Likely can run'
    | "Likely can't run"
    | 'Insufficient data';
export type CheckSource = 'measured' | 'ai' | 'estimate';
export type CheckConfidence = 'high' | 'medium' | 'low';

export interface CheckFps {
    low: number;
    med: number;
    high: number;
    ultra: number;
}

export class CheckResponseDto {
    @ApiProperty({ enum: ['can', 'cant', 'insufficient'], example: 'can' })
    state: CheckState;

    @ApiProperty({
        enum: [
            'Can run',
            "Can't run",
            'Likely can run',
            "Likely can't run",
            'Insufficient data',
        ],
        example: 'Can run',
    })
    verdict: CheckVerdict;

    @ApiProperty({ example: 'Measured ~75fps at 1080p high' })
    sub: string;

    @ApiProperty({ enum: ['measured', 'ai', 'estimate'], nullable: true })
    source: CheckSource | null;

    @ApiProperty({ example: 'gemini', nullable: true })
    provider: string | null;

    @ApiProperty({
        enum: ['high', 'medium', 'low'],
        nullable: true,
    })
    confidence: CheckConfidence | null;

    @ApiProperty({ enum: TARGET_FPS_VALUES, example: 60 })
    targetFps: TargetFps;

    @ApiProperty({
        example: { low: 100, med: 80, high: 60, ultra: 45 },
        nullable: true,
    })
    fps: CheckFps | null;

    @ApiProperty({ example: true, nullable: true })
    gpuPass: boolean | null;

    @ApiProperty({ example: true, nullable: true })
    cpuPass: boolean | null;

    @ApiProperty({ example: true, nullable: true })
    ramPass: boolean | null;

    @ApiProperty({ example: true, nullable: true })
    vramPass: boolean | null;

    @ApiProperty({ example: true, nullable: true })
    ssdPass: boolean | null;

    @ApiProperty({ type: [String] })
    notes: string[];
}
