import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
    @ApiProperty({ maxLength: 100, example: 'admin' })
    @Transform(
        ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
            const value = obj[key];
            return typeof value === 'string' ? value : undefined;
        },
    )
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    username: string;

    @ApiProperty({ maxLength: 256, minLength: 1, example: 'password' })
    @Transform(
        ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
            const value = obj[key];
            return typeof value === 'string' ? value : undefined;
        },
    )
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(256)
    password: string;
}
