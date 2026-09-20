import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SelectRawgGameDto {
    @ApiProperty({ example: 3498 })
    @IsInt()
    @Min(1)
    rawgId: number;
}
