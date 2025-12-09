export class PaginationMeta {
    total: number;
    page: number;
    lastPage: number;
}

export class PaginatedResult<T> {
    data: T[];
    meta: PaginationMeta;
}
