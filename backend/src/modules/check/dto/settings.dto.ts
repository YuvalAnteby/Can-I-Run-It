import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SettingsDto {
    @ApiProperty({
        description: 'The target resolution width (e.g., 1920)',
        example: 1920,
    })
    @IsInt()
    resolutionWidth: number;

    @ApiProperty({
        description: 'The target resolution height (e.g., 1080)',
        example: 1080,
    })
    @IsInt()
    resolutionHeight: number;

    @ApiProperty({
        description:
            'The requirement tier to check against (e.g., minimum, recommended)',
        example: 'minimum',
    })
    @IsString()
    @IsNotEmpty()
    tier: string;

    @ApiProperty({
        description: 'The settings preset (e.g., low, medium, high, ultra)',
        example: 'high',
        required: false,
    })
    @IsString()
    @IsOptional()
    preset?: string;
}
