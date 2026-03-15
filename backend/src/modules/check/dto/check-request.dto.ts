import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

import { HardwareDto } from './hardware.dto';
import { SettingsDto } from './settings.dto';

export class CheckRequestDto {
    @ApiProperty({
        description: 'The URL-friendly slug of the game',
        example: 'cyberpunk-2077',
    })
    @IsString()
    @IsNotEmpty()
    gameSlug: string;

    @ApiProperty({ type: HardwareDto })
    @ValidateNested()
    @Type(() => HardwareDto)
    hardware: HardwareDto;

    @ApiProperty({ type: SettingsDto })
    @ValidateNested()
    @Type(() => SettingsDto)
    settings: SettingsDto;
}
