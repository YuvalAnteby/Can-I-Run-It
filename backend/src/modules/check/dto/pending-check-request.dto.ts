import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';

import { HardwareDto } from './hardware.dto';
import { SettingsDto } from './settings.dto';

export class PendingCheckRequestDto {
    @ApiProperty({ type: HardwareDto })
    @IsDefined()
    @ValidateNested()
    @Type(() => HardwareDto)
    hardware: HardwareDto;

    @ApiProperty({ type: SettingsDto })
    @IsDefined()
    @ValidateNested()
    @Type(() => SettingsDto)
    settings: SettingsDto;
}
