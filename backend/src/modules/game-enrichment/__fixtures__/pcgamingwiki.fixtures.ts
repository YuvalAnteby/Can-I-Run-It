export const exactQueryResponse = {
    query: {
        pages: [{ pageid: 123, ns: 0, title: 'Elden Ring' }],
    },
};

export const redirectQueryResponse = {
    query: {
        redirects: [
            {
                from: 'Elden Ring: Shadow of the Erdtree',
                to: 'Elden Ring',
            },
        ],
        pages: [{ pageid: 123, ns: 0, title: 'Elden Ring' }],
    },
};

export const noPageQueryResponse = {
    query: {
        pages: [{ ns: 0, title: 'No exact page', missing: true }],
    },
};

export const errorQueryResponse = {
    error: { code: 'internal_api_error', info: 'provider-secret' },
};

export const malformedQueryResponse = {
    query: {},
};

export const ambiguousQueryResponse = {
    query: {
        pages: [
            { pageid: 1, ns: 0, title: 'Example (Game)' },
            { pageid: 2, ns: 0, title: 'Example (Remaster)' },
        ],
    },
};

export const mismatchedQueryResponse = {
    query: {
        pages: [{ pageid: 99, ns: 0, title: 'Different Game' }],
    },
};

const infobox = [
    '{{Infobox game/row/developer|FromSoftware}}',
    '{{Infobox game/row/publisher|Bandai Namco Entertainment}}',
    '{{Infobox game/row/date|Windows|2022-02-25}}',
    '{{Infobox game/taxonomy/genres|Action RPG}}',
].join('\n');

export const exactParseResponse = {
    parse: {
        title: 'Elden Ring',
        wikitext: [
            infobox,
            '{{System requirements',
            '|OSfamily=Windows',
            '|minwindows=Windows 10',
            '|mincpu=Intel Core i5-8400',
            '|mingpu=NVIDIA GeForce GTX 1060 3GB',
            '|minram=12 GB',
            '|minstorage=60 GB',
            '|recwindows=Windows 10',
            '|reccpu=Intel Core i7-8700K',
            '|recgpu=NVIDIA GeForce GTX 1070',
            '|recram=16 GB',
            '|recstorage=60 GB',
            '}}',
        ].join('\n'),
    },
};

export const nestedParseResponse = {
    parse: {
        title: 'Elden Ring',
        wikitext: {
            '*': [
                '{{Infobox game',
                '|developer={{Infobox game/row/developer|FromSoftware}}',
                '|publisher={{Infobox game/row/publisher|Bandai Namco Entertainment}}',
                '|release={{Infobox game/row/date|Windows|2022-02-25}}',
                '|genre={{Infobox game/taxonomy/genres|Action RPG}}',
                '|requirements={{System requirements',
                '|OSfamily=Windows',
                '|minRAM=12 GB',
                '|minHD=60 GB',
                '|recRAM=16 GB',
                '|recHD=80 GB',
                '}}',
                '}}',
            ].join('\n'),
        },
    },
};

export const noWindowsRequirementsParseResponse = {
    parse: {
        title: 'Elden Ring',
        wikitext: infobox,
    },
};

export const errorParseResponse = {
    error: { code: 'internal_api_error', info: 'provider-secret' },
};

export const malformedParseResponse = {
    parse: { title: 'Elden Ring' },
};

const linuxRequirements = [
    '{{System requirements',
    '|OSfamily=Linux',
    '|minram=4 GB',
    '|mincpu=Linux CPU',
    '}}',
].join('\n');

const macRequirements = [
    '{{System requirements',
    '|OSfamily=macOS',
    '|minram=6 GB',
    '|mincpu=macOS CPU',
    '}}',
].join('\n');

const windowsRequirements = [
    '{{System requirements',
    '| OSfamily =  windows  ',
    '|minram=12 GB',
    '|mincpu=Windows CPU',
    '}}',
].join('\n');

export const windowsThenOtherRequirementsParseResponse = {
    parse: {
        title: 'Elden Ring',
        wikitext: [
            infobox,
            windowsRequirements,
            linuxRequirements,
            macRequirements,
        ].join('\n'),
    },
};

export const otherThenWindowsRequirementsParseResponse = {
    parse: {
        title: 'Elden Ring',
        wikitext: [
            infobox,
            linuxRequirements,
            macRequirements,
            windowsRequirements,
        ].join('\n'),
    },
};
