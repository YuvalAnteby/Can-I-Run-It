export const rawgPcRequirementsPayload = {
    id: 12,
    name: 'Elden Ring',
    platforms: [
        {
            platform: { id: 4, slug: 'pc', name: 'PC' },
            requirements: {
                minimum:
                    'OS: Windows 10\nRAM: 8 GB\nVRAM: 4 GB\nStorage: 60 GB\nCPU: Intel Core i5-8400\nGPU: GTX 1060\nSSD required',
                recommended:
                    'OS: Windows 10\nRAM: 16 GB\nVRAM: 8 GB\nStorage: 60 GB\nCPU: Intel Core i7-8700K\nGPU: GTX 1070\nSSD required',
            },
        },
    ],
} as const;
