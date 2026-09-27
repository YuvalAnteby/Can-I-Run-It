import { IsInt, Min } from 'class-validator';

export class GameIdParamsDto {
    @IsInt()
    @Min(1)
    id: number;
}
