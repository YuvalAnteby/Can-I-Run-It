import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MigrationInterface, QueryRunner } from 'typeorm';

// Source and compiled tools use the same checked-in SQL; HTTP startup never invokes it.
const toolsInfra = resolve(__dirname, '../../infra');
export const infraDirectory = existsSync(resolve(toolsInfra, 'init-scripts'))
    ? toolsInfra
    : resolve(__dirname, '../../../infra');
const tables = [
    'game_engines',
    'gpus',
    'cpus',
    'games',
    'game_requirements',
    'performance_records',
];
function sql(directory: string, name: string): string {
    return readFileSync(
        resolve(infraDirectory, directory, name),
        'utf8',
    ).replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '');
}

const lifecycleColumns = [
    'status',
    'rawg_id',
    'rawg_payload',
    'metadata_provenance',
    'rejection_reason',
];

const v1Columns: Record<string, readonly string[]> = {
    game_engines: ['id', 'name', 'version', 'created_at'],
    gpus: [
        'id',
        'slug',
        'name',
        'manufacturer',
        'vram_gb',
        'shading_units',
        'tensor_cores',
        'base_clock_mhz',
        'boost_clock_mhz',
        'memory_bus_width',
        'tdp_watts',
        'benchmarks',
        'release_year',
        'created_at',
        'updated_at',
    ],
    cpus: [
        'id',
        'slug',
        'name',
        'manufacturer',
        'cores',
        'threads',
        'base_clock_ghz',
        'boost_clock_ghz',
        'l3_cache_mb',
        'tdp_watts',
        'benchmarks',
        'release_year',
        'created_at',
        'updated_at',
    ],
    games: [
        'id',
        'slug',
        'name',
        'game_engine_id',
        'publisher',
        'developer',
        'release_date',
        'genre',
        'description',
        'tags',
        'supports_ray_tracing',
        'supports_dlss',
        'supports_fsr',
        'supports_xess',
        'cover_image_url',
        'is_trending',
        'trending_rank',
        'created_at',
        'updated_at',
    ],
    game_requirements: [
        'id',
        'game_id',
        'tier',
        'description',
        'cpu_id',
        'gpu_id',
        'ram_gb',
        'vram_gb',
        'storage_gb',
        'requires_ssd',
        'resolution_width',
        'resolution_height',
        'target_fps',
        'notes',
    ],
    performance_records: [
        'id',
        'game_id',
        'gpu_id',
        'cpu_id',
        'ram_gb',
        'ram_mhz',
        'res_width',
        'res_height',
        'settings',
        'upscaler',
        'upscaler_quality',
        'fps_avg',
        'fps_1_percent_low',
        'verified',
        'source_url',
        'created_at',
    ],
};

const currentColumns: Record<string, readonly string[]> = {
    ...v1Columns,
    games: [
        'id',
        'slug',
        'name',
        ...lifecycleColumns,
        ...v1Columns.games.slice(3),
    ],
    performance_records: [
        ...v1Columns.performance_records.slice(0, 14),
        'source',
        'source_url',
        'created_at',
    ],
};

const enumLabels: Record<string, readonly string[]> = {
    gpu_brand: ['Nvidia', 'AMD', 'Intel'],
    cpu_brand: ['AMD', 'Intel'],
    setting_preset: ['low', 'medium', 'high', 'ultra'],
    upscaler_type: ['off', 'DLSS', 'FSR', 'XeSS'],
    upscaler_quality_mode: [
        'quality',
        'balanced',
        'performance',
        'ultra_performance',
    ],
};

const currentIndexes = [
    'idx_gpus_benchmarks',
    'idx_gpu_name_trgm',
    'idx_cpus_benchmarks',
    'idx_cpu_name_trgm',
    'idx_perf_lookup',
    'idx_perf_gpu',
    'idx_perf_cpu',
];

type ColumnDefinition = {
    type: string;
    notNull: boolean;
    defaultExpression: string | null;
};

const columnDefinitions: Record<string, Record<string, ColumnDefinition>> = {
    game_engines: {
        id: {
            type: 'integer',
            notNull: true,
            defaultExpression: "nextval('game_engines_id_seq'::regclass)",
        },
        name: {
            type: 'character varying(100)',
            notNull: true,
            defaultExpression: null,
        },
        version: {
            type: 'character varying(50)',
            notNull: false,
            defaultExpression: null,
        },
        created_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
    },
    gpus: {
        id: {
            type: 'integer',
            notNull: true,
            defaultExpression: "nextval('gpus_id_seq'::regclass)",
        },
        slug: {
            type: 'character varying(100)',
            notNull: true,
            defaultExpression: null,
        },
        name: {
            type: 'character varying(100)',
            notNull: true,
            defaultExpression: null,
        },
        manufacturer: {
            type: 'gpu_brand',
            notNull: true,
            defaultExpression: null,
        },
        vram_gb: { type: 'integer', notNull: true, defaultExpression: null },
        shading_units: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        tensor_cores: {
            type: 'integer',
            notNull: false,
            defaultExpression: '0',
        },
        base_clock_mhz: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        boost_clock_mhz: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        memory_bus_width: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        tdp_watts: { type: 'integer', notNull: false, defaultExpression: null },
        benchmarks: {
            type: 'jsonb',
            notNull: false,
            defaultExpression: "'{}'::jsonb",
        },
        release_year: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        created_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
        updated_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
    },
    cpus: {
        id: {
            type: 'integer',
            notNull: true,
            defaultExpression: "nextval('cpus_id_seq'::regclass)",
        },
        slug: {
            type: 'character varying(100)',
            notNull: true,
            defaultExpression: null,
        },
        name: {
            type: 'character varying(100)',
            notNull: true,
            defaultExpression: null,
        },
        manufacturer: {
            type: 'cpu_brand',
            notNull: true,
            defaultExpression: null,
        },
        cores: { type: 'integer', notNull: true, defaultExpression: null },
        threads: { type: 'integer', notNull: true, defaultExpression: null },
        base_clock_ghz: {
            type: 'double precision',
            notNull: true,
            defaultExpression: null,
        },
        boost_clock_ghz: {
            type: 'double precision',
            notNull: false,
            defaultExpression: null,
        },
        l3_cache_mb: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        tdp_watts: { type: 'integer', notNull: false, defaultExpression: null },
        benchmarks: {
            type: 'jsonb',
            notNull: false,
            defaultExpression: "'{}'::jsonb",
        },
        release_year: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        created_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
        updated_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
    },
    games: {
        id: {
            type: 'integer',
            notNull: true,
            defaultExpression: "nextval('games_id_seq'::regclass)",
        },
        slug: {
            type: 'character varying(100)',
            notNull: true,
            defaultExpression: null,
        },
        name: {
            type: 'character varying(200)',
            notNull: true,
            defaultExpression: null,
        },
        status: {
            type: 'character varying(20)',
            notNull: true,
            defaultExpression: "'pending_approval'::character varying",
        },
        rawg_id: { type: 'integer', notNull: false, defaultExpression: null },
        rawg_payload: {
            type: 'jsonb',
            notNull: false,
            defaultExpression: null,
        },
        metadata_provenance: {
            type: 'jsonb',
            notNull: true,
            defaultExpression: "'{}'::jsonb",
        },
        rejection_reason: {
            type: 'text',
            notNull: false,
            defaultExpression: null,
        },
        game_engine_id: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        publisher: {
            type: 'character varying(200)',
            notNull: false,
            defaultExpression: null,
        },
        developer: {
            type: 'character varying(200)',
            notNull: false,
            defaultExpression: null,
        },
        release_date: { type: 'date', notNull: false, defaultExpression: null },
        genre: {
            type: 'character varying(100)',
            notNull: false,
            defaultExpression: null,
        },
        description: { type: 'text', notNull: false, defaultExpression: null },
        tags: { type: 'text[]', notNull: false, defaultExpression: null },
        supports_ray_tracing: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        supports_dlss: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        supports_fsr: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        supports_xess: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        cover_image_url: {
            type: 'text',
            notNull: false,
            defaultExpression: null,
        },
        is_trending: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        trending_rank: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        created_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
        updated_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
    },
    game_requirements: {
        id: {
            type: 'integer',
            notNull: true,
            defaultExpression: "nextval('game_requirements_id_seq'::regclass)",
        },
        game_id: { type: 'integer', notNull: true, defaultExpression: null },
        tier: {
            type: 'character varying(50)',
            notNull: true,
            defaultExpression: null,
        },
        description: { type: 'text', notNull: false, defaultExpression: null },
        cpu_id: { type: 'integer', notNull: false, defaultExpression: null },
        gpu_id: { type: 'integer', notNull: false, defaultExpression: null },
        ram_gb: { type: 'integer', notNull: true, defaultExpression: null },
        vram_gb: { type: 'integer', notNull: false, defaultExpression: null },
        storage_gb: {
            type: 'integer',
            notNull: false,
            defaultExpression: null,
        },
        requires_ssd: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        resolution_width: {
            type: 'integer',
            notNull: false,
            defaultExpression: '1920',
        },
        resolution_height: {
            type: 'integer',
            notNull: false,
            defaultExpression: '1080',
        },
        target_fps: {
            type: 'integer',
            notNull: false,
            defaultExpression: '30',
        },
        notes: { type: 'text', notNull: false, defaultExpression: null },
    },
    performance_records: {
        id: {
            type: 'integer',
            notNull: true,
            defaultExpression:
                "nextval('performance_records_id_seq'::regclass)",
        },
        game_id: { type: 'integer', notNull: true, defaultExpression: null },
        gpu_id: { type: 'integer', notNull: true, defaultExpression: null },
        cpu_id: { type: 'integer', notNull: true, defaultExpression: null },
        ram_gb: { type: 'integer', notNull: true, defaultExpression: null },
        ram_mhz: { type: 'integer', notNull: false, defaultExpression: null },
        res_width: { type: 'integer', notNull: true, defaultExpression: null },
        res_height: { type: 'integer', notNull: true, defaultExpression: null },
        settings: {
            type: 'setting_preset',
            notNull: true,
            defaultExpression: null,
        },
        upscaler: {
            type: 'upscaler_type',
            notNull: false,
            defaultExpression: "'off'::upscaler_type",
        },
        upscaler_quality: {
            type: 'upscaler_quality_mode',
            notNull: false,
            defaultExpression: null,
        },
        fps_avg: {
            type: 'double precision',
            notNull: true,
            defaultExpression: null,
        },
        fps_1_percent_low: {
            type: 'double precision',
            notNull: false,
            defaultExpression: null,
        },
        verified: {
            type: 'boolean',
            notNull: false,
            defaultExpression: 'false',
        },
        source: {
            type: 'character varying(50)',
            notNull: true,
            defaultExpression: "'measured'::character varying",
        },
        source_url: { type: 'text', notNull: false, defaultExpression: null },
        created_at: {
            type: 'timestamp without time zone',
            notNull: false,
            defaultExpression: 'now()',
        },
    },
};

const foreignKeyDefinitions = [
    ['games', 'game_engine_id', 'game_engines', 'id', 'NO ACTION'],
    ['game_requirements', 'game_id', 'games', 'id', 'CASCADE'],
    ['game_requirements', 'cpu_id', 'cpus', 'id', 'SET NULL'],
    ['game_requirements', 'gpu_id', 'gpus', 'id', 'SET NULL'],
    ['performance_records', 'game_id', 'games', 'id', 'NO ACTION'],
    ['performance_records', 'gpu_id', 'gpus', 'id', 'NO ACTION'],
    ['performance_records', 'cpu_id', 'cpus', 'id', 'NO ACTION'],
] as const;

const uniqueDefinitions = [
    ['game_engines', ['name', 'version'], false],
    ['gpus', ['slug'], false],
    ['cpus', ['slug'], false],
    ['games', ['slug'], false],
    ['game_requirements', ['game_id', 'tier'], false],
    ['games', ['rawg_id'], true],
] as const;

const primaryKeyTables = [
    'game_engines',
    'gpus',
    'cpus',
    'games',
    'game_requirements',
    'performance_records',
] as const;

const indexDefinitions = [
    ['idx_gpus_benchmarks', 'gpus', 'gin', ['benchmarks'], undefined],
    ['idx_gpu_name_trgm', 'gpus', 'gin', ['name'], 'gin_trgm_ops'],
    ['idx_cpus_benchmarks', 'cpus', 'gin', ['benchmarks'], undefined],
    ['idx_cpu_name_trgm', 'cpus', 'gin', ['name'], 'gin_trgm_ops'],
    [
        'idx_perf_lookup',
        'performance_records',
        'btree',
        ['game_id', 'res_width', 'res_height', 'settings'],
        undefined,
    ],
    ['idx_perf_gpu', 'performance_records', 'btree', ['gpu_id'], undefined],
    ['idx_perf_cpu', 'performance_records', 'btree', ['cpu_id'], undefined],
] as const;

const checkDefinitions: Record<string, readonly string[]> = {
    games_status_check: [
        `((status)::text = ANY ((ARRAY['pending_approval'::character varying, 'published'::character varying, 'rejected'::character varying])::text[]))`,
    ],
    games_rawg_id_check: [`((rawg_id IS NULL) OR (rawg_id > 0))`],
    games_rawg_payload_check: [
        `((rawg_payload IS NULL) OR (jsonb_typeof(rawg_payload) = 'object'::text))`,
    ],
    games_metadata_provenance_check: [
        `(jsonb_typeof(metadata_provenance) = 'object'::text)`,
    ],
    games_rejection_reason_check: [
        `((((status)::text = 'rejected'::text) AND (rejection_reason IS NOT NULL) AND (length(regexp_replace(rejection_reason, '[[:space:]]'::text, ''::text, 'g'::text)) > 0)) OR (((status)::text <> 'rejected'::text) AND (rejection_reason IS NULL)))`,
    ],
};

const currentConstraintDefinitions: Record<
    string,
    {
        table: string;
        type: 'c' | 'u';
        columns: readonly string[];
        expressions?: readonly string[];
    }
> = {
    games_status_check: {
        table: 'games',
        type: 'c',
        columns: ['status'],
        expressions: checkDefinitions.games_status_check,
    },
    games_rawg_id_key: {
        table: 'games',
        type: 'u',
        columns: ['rawg_id'],
    },
    games_rawg_id_check: {
        table: 'games',
        type: 'c',
        columns: ['rawg_id'],
        expressions: checkDefinitions.games_rawg_id_check,
    },
    games_rawg_payload_check: {
        table: 'games',
        type: 'c',
        columns: ['rawg_payload'],
        expressions: checkDefinitions.games_rawg_payload_check,
    },
    games_metadata_provenance_check: {
        table: 'games',
        type: 'c',
        columns: ['metadata_provenance'],
        expressions: checkDefinitions.games_metadata_provenance_check,
    },
    games_rejection_reason_check: {
        table: 'games',
        type: 'c',
        columns: ['status', 'rejection_reason'],
        expressions: checkDefinitions.games_rejection_reason_check,
    },
};

function normalizeCatalogText(value: string): string {
    return value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/public\./g, '');
}

async function assertColumnDefinitions(
    runner: QueryRunner,
    expected: Record<string, readonly string[]>,
): Promise<void> {
    const rows = (await runner.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                format_type(a.atttypid, a.atttypmod) AS type,
                a.attnotnull AS not_null,
                pg_get_expr(d.adbin, d.adrelid) AS default_expression
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
        [tables],
    )) as {
        table_name: string;
        column_name: string;
        type: string;
        not_null: boolean;
        default_expression: string | null;
    }[];
    const actual = new Map(
        rows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );
    for (const [table, columns] of Object.entries(expected)) {
        for (const column of columns) {
            const definition = columnDefinitions[table]?.[column];
            const row = actual.get(`${table}.${column}`);
            if (!definition || !row)
                throw new Error(
                    `Incompatible database schema; missing column definition: ${table}.${column}`,
                );
            if (
                normalizeCatalogText(row.type) !==
                normalizeCatalogText(definition.type)
            )
                throw new Error(
                    `Incompatible database schema; wrong type for ${table}.${column}`,
                );
            if (row.not_null !== definition.notNull)
                throw new Error(
                    `Incompatible database schema; wrong nullability for ${table}.${column}`,
                );
            const actualDefault = row.default_expression
                ? normalizeCatalogText(row.default_expression)
                : null;
            const expectedDefault = definition.defaultExpression
                ? normalizeCatalogText(definition.defaultExpression)
                : null;
            if (actualDefault !== expectedDefault)
                throw new Error(
                    `Incompatible database schema; wrong default for ${table}.${column}`,
                );
        }
    }
}

async function assertSequenceOwnership(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
        `SELECT sequence.relname AS sequence_name, table_rel.relname AS table_name,
                attribute.attname AS column_name
           FROM pg_class sequence
           JOIN pg_namespace sequence_schema ON sequence_schema.oid = sequence.relnamespace
           JOIN pg_depend dependency ON dependency.objid = sequence.oid
                AND dependency.deptype = 'a'
           JOIN pg_class table_rel ON table_rel.oid = dependency.refobjid
           JOIN pg_namespace table_schema ON table_schema.oid = table_rel.relnamespace
           JOIN pg_attribute attribute ON attribute.attrelid = table_rel.oid
                AND attribute.attnum = dependency.refobjsubid
          WHERE sequence_schema.nspname = 'public'
            AND table_schema.nspname = 'public'
            AND sequence.relkind = 'S'
            AND table_rel.relname = ANY($1)`,
        [tables],
    )) as { sequence_name: string; table_name: string; column_name: string }[];
    const owned = new Set(
        rows.map(
            (row) =>
                `${row.sequence_name}:${row.table_name}.${row.column_name}`,
        ),
    );
    for (const table of tables) {
        if (!owned.has(`${table}_id_seq:${table}.id`))
            throw new Error(
                `Incompatible database schema; ${table}.id sequence is not owned`,
            );
    }
}

async function assertConstraints(
    runner: QueryRunner,
    current: boolean,
): Promise<void> {
    const rows = (await runner.query(
        `SELECT conname AS name, conrelid::regclass::text AS table_name,
                contype AS type, convalidated AS validated,
                pg_get_constraintdef(oid) AS definition,
                pg_get_expr(conbin, conrelid) AS expression,
                COALESCE((
                    SELECT json_agg(attribute.attname ORDER BY key.ordinal)
                      FROM unnest(constraint_data.conkey) WITH ORDINALITY
                           AS key(attnum, ordinal)
                      JOIN pg_attribute attribute
                        ON attribute.attrelid = constraint_data.conrelid
                       AND attribute.attnum = key.attnum
                ), '[]'::json)::text AS columns
           FROM pg_constraint constraint_data
          WHERE connamespace = 'public'::regnamespace`,
    )) as {
        name: string;
        table_name: string;
        type: string;
        validated: boolean;
        definition: string;
        expression: string | null;
        columns: string;
    }[];
    const catalogRows = rows.map((row) => {
        let columns: unknown;
        try {
            columns = JSON.parse(row.columns) as unknown;
        } catch (error) {
            throw new Error('Unable to read PostgreSQL constraint columns', {
                cause: error,
            });
        }
        if (
            !Array.isArray(columns) ||
            columns.some((column) => typeof column !== 'string')
        ) {
            throw new Error('Unable to read PostgreSQL constraint columns');
        }
        return { ...row, columns };
    });
    const hasConstraint = (
        table: string,
        type: string,
        columns: readonly string[],
    ): boolean =>
        catalogRows.some(
            (row) =>
                row.table_name === table &&
                row.type === type &&
                row.validated &&
                row.columns.length === columns.length &&
                row.columns.every((column, index) => column === columns[index]),
        );
    for (const table of primaryKeyTables) {
        if (!hasConstraint(table, 'p', ['id']))
            throw new Error(
                `Incompatible database schema; missing primary key on ${table}`,
            );
    }
    for (const [table, columns, currentOnly] of uniqueDefinitions) {
        if (currentOnly && !current) continue;
        if (!hasConstraint(table, 'u', columns))
            throw new Error(
                `Incompatible database schema; missing unique key on ${table}`,
            );
    }
    for (const [
        table,
        column,
        target,
        targetColumn,
        action,
    ] of foreignKeyDefinitions) {
        const definition = normalizeCatalogText(
            `FOREIGN KEY (${column}) REFERENCES ${target}(${targetColumn})${action === 'NO ACTION' ? '' : ` ON DELETE ${action}`}`,
        );
        if (
            !catalogRows.some(
                (row) =>
                    row.table_name === table &&
                    row.type === 'f' &&
                    row.validated &&
                    normalizeCatalogText(row.definition) === definition,
            )
        )
            throw new Error(
                `Incompatible database schema; missing foreign key ${table}.${column}`,
            );
    }
    if (!current) return;
    const byName = new Map(catalogRows.map((row) => [row.name, row]));
    for (const [name, expected] of Object.entries(
        currentConstraintDefinitions,
    )) {
        const row = byName.get(name);
        if (
            !row ||
            row.table_name !== expected.table ||
            row.type !== expected.type ||
            !row.validated ||
            row.columns.length !== expected.columns.length ||
            !row.columns.every(
                (column, index) => column === expected.columns[index],
            )
        )
            throw new Error(
                `Incompatible database schema; wrong constraint: ${name}`,
            );
        if (
            expected.expressions &&
            !expected.expressions.some(
                (expression) => row.expression === expression,
            )
        ) {
            throw new Error(
                `Incompatible database schema; wrong definition for ${name}`,
            );
        }
    }
}

async function assertIndexes(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
        `SELECT index_class.relname AS name, table_class.relname AS table_name,
                access_method.amname AS method, index_data.indisvalid AS valid,
                ARRAY(
                    SELECT attribute.attname
                      FROM unnest(index_data.indkey) WITH ORDINALITY AS key(attnum, ordinal)
                      JOIN pg_attribute attribute ON attribute.attrelid = index_data.indrelid
                           AND attribute.attnum = key.attnum
                     WHERE key.attnum > 0
                     ORDER BY key.ordinal
                )::text AS columns,
                pg_get_indexdef(index_data.indexrelid) AS definition
           FROM pg_index index_data
           JOIN pg_class index_class ON index_class.oid = index_data.indexrelid
           JOIN pg_class table_class ON table_class.oid = index_data.indrelid
           JOIN pg_namespace index_schema ON index_schema.oid = index_class.relnamespace
           JOIN pg_am access_method ON access_method.oid = index_class.relam
          WHERE index_schema.nspname = 'public' AND index_class.relname = ANY($1)`,
        [currentIndexes],
    )) as {
        name: string;
        table_name: string;
        method: string;
        valid: boolean;
        columns: string;
        definition: string;
    }[];
    const actual = new Map(rows.map((row) => [row.name, row]));
    for (const [
        name,
        table,
        method,
        columns,
        operatorClass,
    ] of indexDefinitions) {
        const row = actual.get(name);
        if (
            !row ||
            row.table_name !== table ||
            row.method !== method ||
            !row.valid
        )
            throw new Error(
                `Incompatible database schema; wrong index ${name}`,
            );
        if (row.columns !== `{${columns.join(',')}}`)
            throw new Error(
                `Incompatible database schema; wrong columns for index ${name}`,
            );
        if (
            operatorClass &&
            !normalizeCatalogText(row.definition).includes(
                normalizeCatalogText(operatorClass),
            )
        )
            throw new Error(
                `Incompatible database schema; wrong operator class for index ${name}`,
            );
    }
}

async function assertSchema(
    runner: QueryRunner,
    expected: Record<string, readonly string[]>,
    current: boolean,
): Promise<void> {
    const rows = (await runner.query(
        "SELECT table_name AS name, column_name AS column FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1)",
        [tables],
    )) as { name: string; column: string }[];
    const present = new Map<string, Set<string>>();
    for (const row of rows) {
        const columns = present.get(row.name) ?? new Set<string>();
        columns.add(row.column);
        present.set(row.name, columns);
    }
    const missing = Object.entries(expected).flatMap(([table, columns]) =>
        columns
            .filter((column) => !present.get(table)?.has(column))
            .map((column) => table + '.' + column),
    );
    if (missing.length)
        throw new Error(
            'Incompatible database schema; missing columns: ' +
                missing.join(', '),
        );

    await assertColumnDefinitions(runner, expected);
    await assertSequenceOwnership(runner);

    const enumRows = (await runner.query(
        "SELECT typname AS name, enumlabel AS label FROM pg_type JOIN pg_enum ON pg_enum.enumtypid=pg_type.oid WHERE typnamespace='public'::regnamespace AND typname=ANY($1) ORDER BY typname, enumsortorder",
        [Object.keys(enumLabels)],
    )) as { name: string; label: string }[];
    const actualEnums = new Map<string, string[]>();
    for (const row of enumRows) {
        const labels = actualEnums.get(row.name) ?? [];
        labels.push(row.label);
        actualEnums.set(row.name, labels);
    }
    for (const [name, labels] of Object.entries(enumLabels)) {
        if (
            JSON.stringify(actualEnums.get(name) ?? []) !==
            JSON.stringify(labels)
        )
            throw new Error('Incompatible database enum ' + name);
    }

    const extension = (await runner.query(
        "SELECT 1 FROM pg_extension WHERE extname='pg_trgm'",
    )) as unknown[];
    if (!extension.length)
        throw new Error(
            'Incompatible database schema; pg_trgm is not installed',
        );

    await assertIndexes(runner);
    await assertConstraints(runner, current);
}

async function adoptOrCreateSchema(runner: QueryRunner): Promise<void> {
    const present = (await runner.query(
        "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1)",
        [tables],
    )) as { name: string }[];
    if (!present.length) {
        for (const file of [
            '01-enums-schema.sql',
            '02-hardware-schema.sql',
            '03-games-schema.sql',
            '04-performance-schema.sql',
        ])
            await runner.query(sql('init-scripts', file));
        await assertSchema(runner, currentColumns, true);
        return;
    }
    if (present.length !== tables.length)
        throw new Error(
            'Partial application schema; review before baseline adoption',
        );

    const columns = (await runner.query(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name='games' AND column_name=ANY($1)",
        [lifecycleColumns],
    )) as { name: string }[];
    if (columns.length !== 0 && columns.length !== lifecycleColumns.length)
        throw new Error(
            'Partial game lifecycle schema; review before baseline adoption',
        );
    if (!columns.length) {
        await assertSchema(runner, v1Columns, false);
        await runner.query(sql('migrations', '001-v2-game-lifecycle.sql'));
    }
    // V1 databases may predate the provenance column added by 002. Apply that
    // narrow upgrade before validating the complete current shape; the SQL is
    // idempotent and preserves any existing source values.
    const sourceColumn = (await runner.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='performance_records' AND column_name='source'",
    )) as unknown[];
    if (!sourceColumn.length)
        await runner.query(
            sql('migrations', '002-demo-performance-source.sql'),
        );
    await assertSchema(runner, currentColumns, true);
}

export class AzureBaseline1790985600000 implements MigrationInterface {
    async up(runner: QueryRunner): Promise<void> {
        await adoptOrCreateSchema(runner);
    }

    down(): Promise<void> {
        throw new Error('Baseline is irreversible; restore an approved backup');
    }
}
export class PerformanceSource1790985600001 implements MigrationInterface {
    async up(runner: QueryRunner): Promise<void> {
        await runner.query(
            sql('migrations', '002-demo-performance-source.sql'),
        );
    }
    down(): Promise<void> {
        throw new Error(
            'Performance source migration preserves provenance and cannot be reversed',
        );
    }
}

export class RuntimeGrants1790985600002 implements MigrationInterface {
    async up(runner: QueryRunner): Promise<void> {
        // Local Compose has no Azure roles. Azure bootstrap supplies all three.
        const roles = (await runner.query(
            "SELECT rolname FROM pg_roles WHERE rolname IN ('ciri-runtime','ciri-migrator','ciri-exporter')",
        )) as { rolname: string }[];
        if (!roles.length) return;
        if (roles.length !== 3)
            throw new Error('Incomplete Azure SQL bootstrap');
        await runner.query(
            'GRANT USAGE ON SCHEMA public TO "ciri-runtime", "ciri-exporter"',
        );
        await runner.query(
            'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "ciri-runtime", "ciri-exporter"',
        );
        await runner.query(
            'GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "ciri-exporter"',
        );
        for (const table of tables.filter(
            (table) => table !== 'game_engines',
        )) {
            await runner.query(
                `GRANT INSERT, UPDATE ON TABLE public.${table} TO "ciri-runtime"`,
            );
            await runner.query(
                `GRANT USAGE ON SEQUENCE public.${table}_id_seq TO "ciri-runtime"`,
            );
        }
    }
    down(): Promise<void> {
        throw new Error(
            'Review grants explicitly before removing runtime access',
        );
    }
}
