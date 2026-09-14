import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
    @ApiProperty({ maxLength: 100, example: 'admin' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    username: string;

    @ApiProperty({ maxLength: 256, minLength: 1, example: 'password' })
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(256)
    password: string;
}
