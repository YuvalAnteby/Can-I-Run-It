import { ApiProperty } from '@nestjs/swagger';

import { ClientGameRequirementDto } from './client-game-requirement.dto';

/**
 * Data Transfer Object representing game information sent to the client.
 */
export class ClientGameDto {
    @ApiProperty({
        description: 'The unique identifier of the game',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'The URL-friendly slug of the game',
        example: 'cyberpunk-2077',
    })
    slug: string;

    @ApiProperty({
        description: 'The display name of the game',
        example: 'Cyberpunk 2077',
    })
    name: string;

    @ApiProperty({
        description: 'The URL of the cover image',
        example: 'https://imgur.com/VDUcpgp.jpg',
        nullable: true,
    })
    coverImageUrl: string | null;

    @ApiProperty({
        description: 'The release date of the game (YYYY-MM-DD)',
        example: '2020-12-10',
        nullable: true,
    })
    releaseDate: string | null;

    @ApiProperty({
        description: 'The developer of the game',
        example: 'CD PROJEKT RED',
        nullable: true,
    })
    developer: string | null;

    @ApiProperty({
        description: 'The publisher of the game',
        example: 'CD PROJEKT RED',
        nullable: true,
    })
    publisher: string | null;

    @ApiProperty({
        description: 'The genre of the game',
        example: 'Action RPG',
        nullable: true,
    })
    genre: string | null;

    @ApiProperty({
        description: 'The description of the game',
        example:
            'Cyberpunk 2077 is an open-world, action-adventure story set in Night City...',
        nullable: true,
    })
    description: string | null;

    @ApiProperty({
        description: 'The tags associated with the game',
        example: ['ray-tracing', 'open-world', 'cpu-heavy'],
        nullable: true,
    })
    tags: string[] | null;

    @ApiProperty({
        description: 'Whether the game supports ray tracing',
        example: true,
    })
    supportsRayTracing: boolean;

    @ApiProperty({
        description: 'Whether the game supports NVIDIA DLSS',
        example: true,
    })
    supportsDlss: boolean;

    @ApiProperty({
        description: 'Whether the game supports AMD FSR',
        example: true,
    })
    supportsFsr: boolean;

    @ApiProperty({
        description: 'Whether the game supports Intel XeSS',
        example: true,
    })
    supportsXeSS: boolean;

    @ApiProperty({
        description: 'Whether the game is currently trending',
        example: false,
    })
    isTrending: boolean;

    @ApiProperty({
        description: 'The rank of the game in trending list',
        example: 1,
        nullable: true,
    })
    trendingRank: number | null;

    @ApiProperty({
        type: () => [ClientGameRequirementDto],
        description: 'The requirements of the game',
    })
    requirements?: ClientGameRequirementDto[];
}
