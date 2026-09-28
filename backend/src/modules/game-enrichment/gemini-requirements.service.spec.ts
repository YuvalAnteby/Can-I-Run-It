import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';

import { GeminiRequirementsService } from './gemini-requirements.service';

type GenerateContentMock = jest.MockedFunction<
    (request: unknown) => Promise<{ text?: string }>
>;

const createSdk = (): { models: { generateContent: GenerateContentMock } } => ({
    models: {
        generateContent: jest.fn<Promise<{ text?: string }>, [unknown]>(),
    },
});

const setSdk = (
    service: GeminiRequirementsService,
    sdk: { models: { generateContent: GenerateContentMock } },
): void => {
    Object.defineProperty(service, 'genAI', {
        configurable: true,
        value: sdk,
        writable: true,
    });
};

const modelResponse = (value: unknown): { text: string } => ({
    text: JSON.stringify(value),
});

describe('GeminiRequirementsService', () => {
    const config = {
        get: jest.fn((key: string) =>
            key === 'GEMINI_API_KEY' ? 'test-api-key' : undefined,
        ),
    } as unknown as ConfigService;

    it('does not call Gemini when the source already contains a deterministic number', async () => {
        const sdk = createSdk();
        const service = new GeminiRequirementsService(config);
        setSdk(service, sdk);

        const values = await service.extractMissingRequirements(
            'Minimum RAM: 8 GB',
            ['requirements.minimum.ramGb'],
            'pcgamingwiki',
            'https://www.pcgamingwiki.com/wiki/Example',
        );

        expect(values).toEqual({});
        expect(sdk.models.generateContent).not.toHaveBeenCalled();
    });

    it('sends only unresolved paths and a bounded excerpt to the model', async () => {
        const sdk = createSdk();
        sdk.models.generateContent.mockResolvedValue(
            modelResponse({
                'requirements.minimum.cpu': {
                    value: 'Intel Core i5-8400',
                    evidence: 'CPU: Intel Core i5-8400',
                },
            }),
        );
        const service = new GeminiRequirementsService(config);
        setSdk(service, sdk);

        const sourceText = `${'unrelated source text '.repeat(1_000)}CPU: Intel Core i5-8400`;
        await service.extractMissingRequirements(
            sourceText,
            ['requirements.minimum.cpu'],
            'pcgamingwiki',
            'https://www.pcgamingwiki.com/wiki/Example',
        );

        const request = sdk.models.generateContent.mock.calls[0]?.[0] as {
            contents?: string;
        };
        expect(request.contents).toContain('requirements.minimum.cpu');
        expect(request.contents).toContain('CPU: Intel Core i5-8400');
        expect(request.contents?.length).toBeLessThan(10_000);
        expect(request.contents).not.toContain('requirements.minimum.ramGb');
    });

    it('labels an evidence-backed value with its source and Gemini extraction', async () => {
        const sdk = createSdk();
        sdk.models.generateContent.mockResolvedValue(
            modelResponse({
                'requirements.minimum.ramGb': {
                    value: 8,
                    evidence: 'Minimum RAM: eight gigabytes',
                },
            }),
        );
        const service = new GeminiRequirementsService(config);
        setSdk(service, sdk);

        const values = await service.extractMissingRequirements(
            'Minimum RAM: eight gigabytes',
            ['requirements.minimum.ramGb'],
            'pcgamingwiki',
            'https://www.pcgamingwiki.com/wiki/Example',
        );

        expect(values['requirements.minimum.ramGb']).toEqual({
            value: 8,
            source: 'pcgamingwiki',
            sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
            extractedBy: 'gemini',
        });
    });

    it('requests and accepts evidence-backed numeric and boolean values', async () => {
        const sdk = createSdk();
        sdk.models.generateContent.mockResolvedValue(
            modelResponse({
                'requirements.minimum.ramGb': {
                    value: 8,
                    evidence: 'Minimum RAM: eight gigabytes',
                },
                'requirements.minimum.requiresSsd': {
                    value: true,
                    evidence: 'Solid-state media is required',
                },
            }),
        );
        const service = new GeminiRequirementsService(config);
        setSdk(service, sdk);

        const values = await service.extractMissingRequirements(
            'Minimum RAM: eight gigabytes\nSolid-state media is required',
            ['requirements.minimum.ramGb', 'requirements.minimum.requiresSsd'],
            'pcgamingwiki',
            'https://www.pcgamingwiki.com/wiki/Example',
        );

        const request = sdk.models.generateContent.mock.calls[0]?.[0] as {
            config?: {
                responseJsonSchema?: {
                    additionalProperties?: {
                        properties?: {
                            value?: { anyOf?: Array<{ type?: string }> };
                        };
                    };
                };
            };
        };
        expect(
            request.config?.responseJsonSchema?.additionalProperties?.properties
                ?.value?.anyOf,
        ).toEqual([
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
        ]);
        expect(values).toEqual({
            'requirements.minimum.ramGb': {
                value: 8,
                source: 'pcgamingwiki',
                sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
                extractedBy: 'gemini',
            },
            'requirements.minimum.requiresSsd': {
                value: true,
                source: 'pcgamingwiki',
                sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
                extractedBy: 'gemini',
            },
        });
    });

    it('preserves the dynamic output schema in the SDK wire request', async () => {
        const sdk = new GoogleGenAI({ apiKey: 'test-api-key' });
        const requestSpy = jest
            .spyOn(
                (
                    sdk.models as unknown as {
                        apiClient: {
                            request: (...args: never[]) => Promise<unknown>;
                        };
                    }
                ).apiClient,
                'request',
            )
            .mockResolvedValue({
                json: () =>
                    Promise.resolve({
                        candidates: [{ content: { parts: [{ text: '{}' }] } }],
                    }),
                headers: new Headers(),
            });
        const service = new GeminiRequirementsService(config);
        setSdk(
            service,
            sdk as unknown as {
                models: { generateContent: GenerateContentMock };
            },
        );

        await service.extractMissingRequirements(
            'Solid-state media is required',
            ['requirements.minimum.requiresSsd'],
            'rawg',
            null,
        );

        const request = requestSpy.mock.calls[0]?.[0] as { body?: string };
        const body = JSON.parse(request.body ?? '{}') as {
            generationConfig?: {
                responseSchema?: unknown;
                responseJsonSchema?: {
                    type?: string;
                    additionalProperties?: {
                        properties?: Record<string, unknown>;
                    };
                };
            };
        };
        expect(body.generationConfig?.responseSchema).toBeUndefined();
        const schema = body.generationConfig?.responseJsonSchema;
        expect(schema?.type).toBe('object');
        expect(schema?.additionalProperties?.properties).toHaveProperty(
            'value',
        );
        expect(schema?.additionalProperties?.properties).toHaveProperty(
            'evidence',
        );
    });

    it('drops model values whose evidence quote is not present in the source', async () => {
        const sdk = createSdk();
        sdk.models.generateContent.mockResolvedValue(
            modelResponse({
                'requirements.minimum.ramGb': {
                    value: 16,
                    evidence: 'RAM: 16 GB',
                },
            }),
        );
        const service = new GeminiRequirementsService(config);
        setSdk(service, sdk);

        await expect(
            service.extractMissingRequirements(
                'Minimum RAM: eight gigabytes',
                ['requirements.minimum.ramGb'],
                'pcgamingwiki',
                'https://www.pcgamingwiki.com/wiki/Example',
            ),
        ).resolves.toEqual({});
    });

    it.each([0, -1, 100_000, Number.NaN])(
        'drops a RAM value outside the sane positive range: %s',
        async (value) => {
            const sdk = createSdk();
            sdk.models.generateContent.mockResolvedValue(
                modelResponse({
                    'requirements.minimum.ramGb': {
                        value,
                        evidence: 'RAM: eight gigabytes',
                    },
                }),
            );
            const service = new GeminiRequirementsService(config);
            setSdk(service, sdk);

            await expect(
                service.extractMissingRequirements(
                    'RAM: eight gigabytes',
                    ['requirements.minimum.ramGb'],
                    'rawg',
                    null,
                ),
            ).resolves.toEqual({});
        },
    );

    it('returns no candidates for malformed model JSON instead of persisting guessed data', async () => {
        const sdk = createSdk();
        sdk.models.generateContent.mockResolvedValue({
            text: '{not-json',
        });
        const service = new GeminiRequirementsService(config);
        setSdk(service, sdk);

        await expect(
            service.extractMissingRequirements(
                'GPU: a completely unknown model',
                ['requirements.minimum.gpu'],
                'rawg',
                null,
            ),
        ).resolves.toEqual({});
    });
});
