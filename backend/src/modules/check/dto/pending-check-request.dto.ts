import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { HardwareDto } from './hardware.dto';
import { SettingsDto } from './settings.dto';

export class PendingCheckRequestDto {
    @ApiProperty({ type: HardwareDto })
    @ValidateNested()
    @Type(() => HardwareDto)
    hardware: HardwareDto;

    @ApiProperty({ type: SettingsDto })
    @ValidateNested()
    @Type(() => SettingsDto)
    settings: SettingsDto;
}
