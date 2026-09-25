import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DiscoverGamesDto {
    @ApiProperty({ minLength: 1, maxLength: 100, example: 'Cyberpunk 2077' })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : (value as unknown),
    )
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    q: string;
}
