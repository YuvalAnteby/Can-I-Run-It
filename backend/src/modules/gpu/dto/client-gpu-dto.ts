import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object representing GPU information sent to the client.
 */
export class ClientGpuDto {
    @ApiProperty({
        description: 'The unique identifier of the GPU',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'The slug of the GPU',
        example: 'nvidia-geforce-rtx-4090',
    })
    slug: string;

    @ApiProperty({
        description: 'The name of the GPU',
        example: 'GeForce RTX 4090',
    })
    name: string;

    @ApiProperty({
        description: 'The manufacturer of the GPU',
        example: 'Nvidia',
    })
    manufacturer: string;

    @ApiProperty({
        description: 'The VRAM of the GPU in GB',
        example: 24,
    })
    vram_gb: number;

    @ApiProperty({
        description: 'The number of shading units of the GPU',
        example: 16384,
        nullable: true,
    })
    shading_units: number | null;

    @ApiProperty({
        description: 'The TDP of the GPU in Watts',
        example: 450,
        nullable: true,
    })
    tdp_watts: number | null;

    @ApiProperty({
        description: 'The release year of the GPU',
        example: 2022,
        nullable: true,
    })
    release_year: number | null;
}
