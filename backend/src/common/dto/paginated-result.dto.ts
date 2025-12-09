import { ApiProperty } from "@nestjs/swagger";

export class PaginationMeta {
    @ApiProperty()
    total: number;
    
    @ApiProperty()
    page: number;

    @ApiProperty()
    lastPage: number;
}

export class PaginatedResult<T> {
    @ApiProperty({ isArray: true })
    data: T[];

    @ApiProperty({ type: () => PaginationMeta })
    meta: PaginationMeta;
}
