import { ApiProperty } from '@nestjs/swagger';

import { ClientCpuDto } from '../../cpu/dto/client-cpu-dto';
import { ClientGpuDto } from '../../gpu/dto/client-gpu-dto';

export class ClientGameRequirementDto {
    @ApiProperty({
        description: 'The tier of the requirement (e.g., minimum, recommended)',
        example: 'minimum',
    })
    tier: string;

    @ApiProperty({
        description: 'Human readable explanation of what this tier targets',
        example: 'For 60fps at 1080p High settings',
        nullable: true,
    })
    description: string | null;

    @ApiProperty({ type: () => ClientCpuDto, nullable: true })
    cpu: ClientCpuDto | null;

    @ApiProperty({ type: () => ClientGpuDto, nullable: true })
    gpu: ClientGpuDto | null;

    @ApiProperty({ description: 'The required RAM in GB', example: 8 })
    ramGb: number;

    @ApiProperty({
        description: 'The required VRAM in GB',
        example: 4,
        nullable: true,
    })
    vramGb: number | null;

    @ApiProperty({
        description: 'The required storage space in GB',
        example: 50,
        nullable: true,
    })
    storageGb: number | null;

    @ApiProperty({ description: 'Whether an SSD is required' })
    requiresSsd: boolean;

    @ApiProperty({ description: 'The target resolution width', example: 1920 })
    resolutionWidth: number;

    @ApiProperty({ description: 'The target resolution height', example: 1080 })
    resolutionHeight: number;

    @ApiProperty({ description: 'The target FPS', example: 30 })
    targetFps: number;

    @ApiProperty({
        description:
            'Soft requirements: DirectX version, OS, driver notes, etc.',
        nullable: true,
    })
    notes: string | null;
}
