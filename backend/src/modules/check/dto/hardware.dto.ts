import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class HardwareDto {
    @ApiProperty({
        description: 'The ID of the CPU to check against',
        example: 1,
    })
    @IsInt()
    cpuId: number;

    @ApiProperty({
        description: 'The ID of the GPU to check against',
        example: 1,
    })
    @IsInt()
    gpuId: number;

    @ApiProperty({
        description: 'The amount of RAM in GB',
        example: 16,
    })
    @IsInt()
    @Min(4)
    @Max(128)
    ramGb: number;

    @ApiProperty({
        description: 'Whether the system uses an SSD',
        example: true,
    })
    @IsBoolean()
    isSsd: boolean;
}
