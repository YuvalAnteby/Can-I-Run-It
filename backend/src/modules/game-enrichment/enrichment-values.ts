export type RequirementTier = 'minimum' | 'recommended';

export type RequirementField =
    | 'ramGb'
    | 'vramGb'
    | 'storageGb'
    | 'cpu'
    | 'gpu'
    | 'requiresSsd'
    | 'notes';

export type FieldPath =
    | 'publisher'
    | 'developer'
    | 'releaseDate'
    | 'genre'
    | 'description'
    | 'tags'
    | 'coverImageUrl'
    | 'supportsRayTracing'
    | 'supportsDlss'
    | 'supportsFsr'
    | 'supportsXeSS'
    | `requirements.${RequirementTier}.${RequirementField}`;

export type CandidateValue = {
    value: string | string[] | number | boolean;
    source: 'rawg' | 'pcgamingwiki' | 'admin';
    sourceUrl: string | null;
    extractedBy: 'gemini' | null;
};

export type CandidateValues = Partial<Record<FieldPath, CandidateValue>>;

const METADATA_FIELDS = [
    'publisher',
    'developer',
    'releaseDate',
    'genre',
    'description',
    'tags',
    'coverImageUrl',
    'supportsRayTracing',
    'supportsDlss',
    'supportsFsr',
    'supportsXeSS',
] as const satisfies readonly FieldPath[];

const REQUIREMENT_FIELDS = [
    'ramGb',
    'vramGb',
    'storageGb',
    'cpu',
    'gpu',
    'requiresSsd',
    'notes',
] as const satisfies readonly RequirementField[];

const rawgUrl = (rawgId: number): string => `https://rawg.io/games/${rawgId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const nonblank = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

export const isValidCalendarDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    return (
        year >= 1 &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= daysInMonth[month - 1]
    );
};

const candidate = (
    value: CandidateValue['value'],
    source: CandidateValue['source'],
    sourceUrl: string | null,
    extractedBy: CandidateValue['extractedBy'] = null,
): CandidateValue => ({
    value,
    source,
    sourceUrl,
    extractedBy,
});

const namedValues = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];

    return [
        ...new Set(
            value
                .filter(isRecord)
                .map((item) => item.name)
                .filter(nonblank)
                .map((item) => item.trim()),
        ),
    ];
};

const textFor = (value: unknown): string | undefined =>
    nonblank(value) ? value.trim() : undefined;

const PROVIDER_FIELD_LIMITS = {
    publisher: 200,
    developer: 200,
    genre: 100,
} as const;

export const providerValueWarning = (
    path: FieldPath,
    value: unknown,
): string | undefined => {
    const limit =
        PROVIDER_FIELD_LIMITS[path as keyof typeof PROVIDER_FIELD_LIMITS];
    return typeof limit === 'number' &&
        typeof value === 'string' &&
        value.length > limit
        ? `Provider value exceeds persistence limit: ${path}`
        : undefined;
};

export const unsupportedRequirementUnitWarning = (
    tier: RequirementTier,
    field: RequirementField,
): string => `Unsupported requirement unit: requirements.${tier}.${field}`;

export const skippedRequirementTierWarning = (tier: RequirementTier): string =>
    `Skipped requirement tier: ${tier}`;

export const isRawgPcPlatform = (entry: unknown): boolean => {
    if (!isRecord(entry) || !isRecord(entry.platform)) return false;
    const platform = entry.platform;
    return (
        platform.id === 4 ||
        [platform.slug, platform.name]
            .filter(nonblank)
            .some((value) => ['pc', 'windows'].includes(value.toLowerCase()))
    );
};

const requirementPath = (
    tier: RequirementTier,
    field: RequirementField,
): FieldPath => `requirements.${tier}.${field}`;

const labeledValue = (text: string, labels: string[]): string | undefined => {
    const label = labels.join('|');
    const match = text.match(
        new RegExp(
            `(?:^|[\\n;|])\\s*(?:(?:minimum|recommended)\\s+)?(?:${label})\\s*(?::|=|-)?\\s*([^\\n;|]+)`,
            'i',
        ),
    );
    return match?.[1]?.trim();
};

const gigabytes = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const match = value.match(/(\d+(?:\.\d+)?)\s*(GB|MB)\b/i);
    if (!match) return undefined;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    return Math.ceil(match[2].toUpperCase() === 'MB' ? amount / 1024 : amount);
};

const isSupportedFieldPath = (path: string): path is FieldPath =>
    METADATA_FIELDS.includes(path as (typeof METADATA_FIELDS)[number]) ||
    /^(?:requirements\.(?:minimum|recommended)\.)?(?:ramGb|vramGb|storageGb|cpu|gpu|requiresSsd|notes)$/.test(
        path,
    );

const hasValue = (
    entry: CandidateValue | undefined,
): entry is CandidateValue => {
    if (!entry) return false;
    if (entry.source === 'admin') return true;
    if (typeof entry.value === 'string') return nonblank(entry.value);
    if (Array.isArray(entry.value)) {
        return entry.value.length > 0 && entry.value.every(nonblank);
    }
    if (typeof entry.value === 'number') {
        return Number.isFinite(entry.value) && entry.value > 0;
    }
    return entry.value === true || entry.sourceUrl !== null;
};

export function extractRawg(payload: unknown, rawgId: number): CandidateValues {
    return extractRawgWithWarnings(payload, rawgId).values;
}

export function extractRawgWithWarnings(
    payload: unknown,
    rawgId: number,
): { values: CandidateValues; warnings: string[] } {
    if (!Number.isSafeInteger(rawgId) || rawgId <= 0) {
        throw new Error('RAWG id must be a positive safe integer');
    }
    if (!isRecord(payload)) throw new Error('RAWG payload must be an object');
    if (payload.id !== rawgId) {
        throw new Error('RAWG id does not match the retained identity');
    }
    if (!nonblank(payload.name)) throw new Error('RAWG name is missing');

    const sourceUrl = rawgUrl(rawgId);
    const values: CandidateValues = {};
    const warnings: string[] = [];
    const addText = (path: FieldPath, value: unknown): void => {
        const text = textFor(value);
        if (!text) return;
        const providerWarning = providerValueWarning(path, text);
        if (providerWarning) {
            warnings.push(providerWarning);
            return;
        }
        values[path] = candidate(text, 'rawg', sourceUrl);
    };

    const releaseDate = textFor(payload.released);
    if (releaseDate && isValidCalendarDate(releaseDate)) {
        addText('releaseDate', releaseDate);
    }
    addText('coverImageUrl', payload.background_image);
    addText('description', payload.description_raw);

    const fields: Array<
        [FieldPath, unknown, 'publisher' | 'developer' | 'genre' | 'tags']
    > = [
        ['developer', payload.developers, 'developer'],
        ['publisher', payload.publishers, 'publisher'],
        ['genre', payload.genres, 'genre'],
        ['tags', payload.tags, 'tags'],
    ];
    for (const [path, raw, kind] of fields) {
        const names = namedValues(raw);
        if (names.length > 0) {
            const value = kind === 'tags' ? names : names[0];
            const providerWarning = providerValueWarning(path, value);
            if (providerWarning) {
                warnings.push(providerWarning);
            } else {
                values[path] = candidate(value, 'rawg', sourceUrl);
            }
        }
    }

    const featureFlags: Array<[FieldPath, unknown]> = [
        ['supportsRayTracing', payload.supportsRayTracing],
        ['supportsDlss', payload.supportsDlss],
        ['supportsFsr', payload.supportsFsr],
        ['supportsXeSS', payload.supportsXeSS],
    ];
    for (const [path, raw] of featureFlags) {
        if (raw === true) values[path] = candidate(true, 'rawg', sourceUrl);
    }

    if (Array.isArray(payload.platforms)) {
        const platforms = payload.platforms as unknown[];
        const windows = platforms.find(isRawgPcPlatform);
        const requirements = isRecord(windows)
            ? windows.requirements
            : undefined;
        if (isRecord(requirements)) {
            for (const tier of ['minimum', 'recommended'] as const) {
                const text = textFor(requirements[tier]);
                if (text) {
                    const normalized = normalizeRequirementsWithWarnings(
                        text,
                        tier,
                        'rawg',
                        sourceUrl,
                    );
                    Object.assign(values, normalized.values);
                    warnings.push(...normalized.warnings);
                }
            }
            if (
                ['minimum', 'recommended'].some((tier) =>
                    textFor(requirements[tier]),
                )
            ) {
                for (const tier of ['minimum', 'recommended'] as const) {
                    if (!textFor(requirements[tier])) {
                        warnings.push(skippedRequirementTierWarning(tier));
                    }
                }
            }
        }
    }

    return { values, warnings: [...new Set(warnings)] };
}

export function normalizeRequirements(
    rawText: string,
    tier: RequirementTier,
    source: 'rawg' | 'pcgamingwiki',
    sourceUrl: string | null,
): CandidateValues {
    return normalizeRequirementsWithWarnings(rawText, tier, source, sourceUrl)
        .values;
}

export function normalizeRequirementsWithWarnings(
    rawText: string,
    tier: RequirementTier,
    source: 'rawg' | 'pcgamingwiki',
    sourceUrl: string | null,
): { values: CandidateValues; warnings: string[] } {
    if (!nonblank(rawText)) {
        return { values: {}, warnings: [skippedRequirementTierWarning(tier)] };
    }

    const values: CandidateValues = {};
    const warnings: string[] = [];
    const numericValue = (
        field: 'ramGb' | 'vramGb' | 'storageGb',
        value: string | undefined,
    ): number | undefined => {
        if (value && /\d/.test(value) && !/(?:GB|MB)\b/i.test(value)) {
            warnings.push(unsupportedRequirementUnitWarning(tier, field));
        }
        return gigabytes(value);
    };
    const add = (
        field: RequirementField,
        value: CandidateValue['value'] | undefined,
    ): void => {
        if (value !== undefined) {
            values[requirementPath(tier, field)] = candidate(
                value,
                source,
                sourceUrl,
            );
        }
    };

    add(
        'ramGb',
        numericValue('ramGb', labeledValue(rawText, ['RAM', 'Memory'])),
    );
    add(
        'vramGb',
        numericValue('vramGb', labeledValue(rawText, ['VRAM', 'Video memory'])),
    );
    add(
        'storageGb',
        numericValue(
            'storageGb',
            labeledValue(rawText, ['Storage', 'Storage space', 'Hard drive']),
        ),
    );

    const cpu = labeledValue(rawText, ['CPU', 'Processor']);
    if (nonblank(cpu)) add('cpu', cpu);
    const gpu = labeledValue(rawText, ['GPU', 'Graphics card', 'Video card']);
    if (nonblank(gpu)) add('gpu', gpu);

    if (
        /(?:SSD|solid[- ]state drive)\s*(?:is\s*)?(?:required|needed|mandatory)/i.test(
            rawText,
        )
    ) {
        add('requiresSsd', true);
    }

    const notes = [
        labeledValue(rawText, ['OS', 'Operating system', 'Windows']),
        labeledValue(rawText, ['DirectX']),
    ].filter(nonblank);
    if (notes.length > 0) add('notes', notes.join('; '));

    if (Object.keys(values).length === 0) {
        warnings.push(skippedRequirementTierWarning(tier));
    }
    return { values, warnings: [...new Set(warnings)] };
}

export function mergeMissing(
    current: CandidateValues,
    candidates: CandidateValues,
): CandidateValues {
    const merged: CandidateValues = {};
    for (const [path, value] of Object.entries(current)) {
        if (isSupportedFieldPath(path) && value && hasValue(value)) {
            merged[path] = value;
        }
    }
    for (const [path, value] of Object.entries(candidates)) {
        if (
            isSupportedFieldPath(path) &&
            value &&
            hasValue(value) &&
            !hasValue(merged[path])
        ) {
            merged[path] = value;
        }
    }
    return merged;
}

export function summarizeMissing(values: CandidateValues): FieldPath[] {
    const missing: string[] = [];
    for (const field of METADATA_FIELDS) {
        if (!hasValue(values[field])) missing.push(field);
    }

    const tiers: RequirementTier[] = ['minimum'];
    if (
        REQUIREMENT_FIELDS.some((field) =>
            hasValue(values[requirementPath('recommended', field)]),
        )
    ) {
        tiers.push('recommended');
    }

    for (const tier of tiers) {
        for (const field of REQUIREMENT_FIELDS) {
            const path = requirementPath(tier, field);
            if (!hasValue(values[path])) missing.push(path);
        }
    }

    return missing.sort() as FieldPath[];
}
