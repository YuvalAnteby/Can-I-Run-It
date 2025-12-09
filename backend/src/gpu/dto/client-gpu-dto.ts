import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object representing GPU information sent to the client.
 */
export class ClientGpuDto {
    @ApiProperty()
    id: number;

    @ApiProperty()
    slug: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    manufacturer: string;
}
