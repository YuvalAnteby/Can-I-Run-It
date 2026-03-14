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
        example: 'nvidia',
    })
    manufacturer: string;

    @ApiProperty({
        description: 'The VRAM of the GPU in GB',
        example: 24,
    })
    vram_gb: number;
}
