import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
} from 'class-validator';

import {
    UpscalerQualityMode,
    UpscalerType,
} from '../../performance/entities/performance-record.entity';

export enum SettingPreset {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    ULTRA = 'ultra',
}

export const TARGET_FPS_VALUES = [30, 60, 90, 120, 144] as const;
export type TargetFps = (typeof TARGET_FPS_VALUES)[number];

export class SettingsDto {
    @ApiProperty({
        description: 'The target resolution width (e.g., 1920)',
        example: 1920,
    })
    @IsInt()
    @Min(1)
    resolutionWidth: number;

    @ApiProperty({
        description: 'The target resolution height (e.g., 1080)',
        example: 1080,
    })
    @IsInt()
    @Min(1)
    resolutionHeight: number;

    @ApiProperty({
        description:
            'The requirement tier to check against (e.g., minimum, recommended)',
        example: 'minimum',
    })
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    tier?: string;

    @ApiProperty({
        description: 'The settings preset (e.g., low, medium, high, ultra)',
        enum: SettingPreset,
        example: SettingPreset.HIGH,
        required: false,
    })
    @IsEnum(SettingPreset)
    preset: SettingPreset;

    @ApiProperty({
        description: 'The target FPS',
        enum: TARGET_FPS_VALUES,
        default: 60,
        required: false,
    })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @IsIn(TARGET_FPS_VALUES)
    targetFps?: TargetFps = 60;

    @ApiProperty({ enum: UpscalerType, required: false })
    @IsOptional()
    @IsEnum(UpscalerType)
    upscaler?: UpscalerType;

    @ApiProperty({ enum: UpscalerQualityMode, required: false })
    @IsOptional()
    @IsEnum(UpscalerQualityMode)
    upscalerQuality?: UpscalerQualityMode;
}
