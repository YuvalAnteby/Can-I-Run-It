import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object representing CPU information sent to the client.
 */
export class ClientCpuDto {
    @ApiProperty({
        description: 'The unique identifier of the CPU',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'The slug of the CPU',
        example: 'ryzen-r5-3600',
    })
    slug: string;

    @ApiProperty({
        description: 'The name of the CPU',
        example: 'Ryzen r5 3600',
    })
    name: string;

    @ApiProperty({
        description: 'The manufacturer of the CPU',
        example: 'Intel',
    })
    manufacturer: string;

    @ApiProperty({
        description: 'The TDP of the CPU in Watts',
        example: 65,
        nullable: true,
    })
    tdp_watts: number | null;

    @ApiProperty({
        description: 'The release year of the CPU',
        example: 2019,
        nullable: true,
    })
    release_year: number | null;

    @ApiProperty({
        description: 'The benchmarks of the CPU',
        example: { passmark: 17800 },
        required: false,
    })
    benchmarks?: Record<string, number>;
}
