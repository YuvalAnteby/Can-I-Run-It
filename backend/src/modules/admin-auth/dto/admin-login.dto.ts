import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
    @ApiProperty({ maxLength: 100, example: 'admin' })
    @Type(() => Object)
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    username: string;

    @ApiProperty({ maxLength: 256, minLength: 1, example: 'password' })
    @Type(() => Object)
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(256)
    password: string;
}
