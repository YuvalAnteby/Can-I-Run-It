import { ApiProperty } from '@nestjs/swagger';

export class ClientGameDto {
    @ApiProperty()
    id: number;

    @ApiProperty()
    slug: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ nullable: true })
    coverImageUrl: string | null;

    @ApiProperty({ nullable: true })
    releaseDate: string | null;

    @ApiProperty({ nullable: true })
    developer: string | null;

    @ApiProperty({ nullable: true })
    publisher: string | null;

    @ApiProperty()
    supportsRayTracing: boolean;

    @ApiProperty()
    supportsDlss: boolean;

    @ApiProperty()
    supportsFsr: boolean;
}
