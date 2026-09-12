import { GoogleGenAI, Type } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SettingsDto } from '../check/dto/settings.dto';
import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { Gpu } from '../gpu/entities/gpu.entity';
import { SettingPreset } from '../performance/entities/performance-record.entity';

export interface GeminiEstimate {
    fps: {
        low: number;
        med: number;
        high: number;
        ultra: number;
    };
    /** Optional short note (≤100 chars). Null if nothing notable. */
    note: string | null;
}

const SYSTEM_PROMPT = `You are a PC gaming hardware expert with deep knowledge of real-world game performance.
You will be given a hardware configuration and a game, and must estimate average FPS at four quality presets.

Rules:
- Respond ONLY with a valid JSON object. No markdown fences, no explanation, no preamble.
- All fps values must be positive integers.
- Calibration reference: an RTX 4090 + i9-13900K running a modern AAA title at 1080p High averages ~140fps.
- The "note" field must be null if there is nothing notable, or a plain string under 100 characters if there is (e.g. shader compilation stutters, VRAM pressure, known CPU bottleneck).

Response schema:
{
  "fps": { "low": number, "med": number, "high": number, "ultra": number },
  "note": string | null
}`;

const GEMINI_TIMEOUT_MS = 8_000;

@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private readonly apiKey: string | undefined;
    private readonly genAI: GoogleGenAI | undefined;

    constructor(private readonly config: ConfigService) {
        this.apiKey = this.config.get<string>('GEMINI_API_KEY');
        if (this.apiKey) {
            this.genAI = new GoogleGenAI({ apiKey: this.apiKey });
        }
    }

    /**
     * Asks Gemini to estimate FPS for the given hardware + game + settings combo.
     * Returns null if the API key is missing, the request times out, or the
     * response cannot be parsed — callers should fall through to the heuristic.
     */
    async estimate(
        game: Game,
        cpu: Cpu,
        gpu: Gpu,
        ramGb: number,
        settings: SettingsDto,
    ): Promise<GeminiEstimate | null> {
        this.logger.debug(
            `Estimating with Gemini for ${game.name} on ${cpu.name} + ${gpu.name} + ${ramGb}GB RAM`,
        );

        if (!this.apiKey) {
            this.logger.warn('GEMINI_API_KEY not set — skipping Gemini flow');
            return null;
        }

        const userPrompt = this.buildPrompt(game, cpu, gpu, ramGb, settings);

        let raw: string;
        try {
            raw = await this.callGemini(userPrompt);
        } catch {
            this.logger.error('Gemini API call failed');
            return null;
        }

        try {
            return this.parseResponse(raw);
        } catch {
            this.logger.error('Failed to parse Gemini response');
            return null;
        }
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private buildPrompt(
        game: Game,
        cpu: Cpu,
        gpu: Gpu,
        ramGb: number,
        settings: SettingsDto,
    ): string {
        const resLabel = `${settings.resolutionWidth}x${settings.resolutionHeight}`;
        return [
            `Game: ${game.name}`,
            `GPU: ${gpu.name}`,
            `CPU: ${cpu.name}`,
            `RAM: ${ramGb ?? 16}GB`, // SettingsDto may not carry RAM; default to 16
            `Target resolution: ${resLabel}`,
            `Requested preset: ${settings.preset ?? SettingPreset.HIGH}`,
            '',
            'Estimate average FPS at all four presets (low, med, high, ultra) for this exact hardware and game.',
        ].join('\n');
    }

    private async callGemini(userPrompt: string): Promise<string> {
        if (!this.genAI) {
            throw new Error('GenAI Client is not initialized');
        }

        const controller = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('Gemini API timeout'));
                controller.abort();
            }, GEMINI_TIMEOUT_MS);
        });

        try {
            const callPromise = this.genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: userPrompt,
                config: {
                    abortSignal: controller.signal,
                    systemInstruction: SYSTEM_PROMPT,
                    temperature: 0.2, // Low temp → more consistent numeric estimates
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            // The fps values should be rounded to the nearest integer by the model, but we round again just in case.
                            fps: {
                                type: Type.OBJECT,
                                // All four presets must be present in the response
                                // even if some have the same value (e.g. low and med might both be 30fps).
                                properties: {
                                    low: { type: Type.INTEGER },
                                    med: { type: Type.INTEGER },
                                    high: { type: Type.INTEGER },
                                    ultra: { type: Type.INTEGER },
                                },
                                required: ['low', 'med', 'high', 'ultra'],
                            },
                            // The note is optional and can be null if there's nothing notable to mention.
                            note: { type: Type.STRING, nullable: true },
                        },
                        required: ['fps'],
                    },
                },
            });

            // Promise.race doesn't infer well with generic Promises. We assert to the GenerateContentResponse interface shape.
            const response = (await Promise.race([
                callPromise,
                timeoutPromise,
            ])) as { text?: string };

            const text = response.text;

            if (!text) {
                throw new Error('Unexpected Gemini response shape');
            }

            return text.trim();
        } finally {
            clearTimeout(timeoutId!);
        }
    }

    private parseResponse(raw: string): GeminiEstimate {
        // Strip accidental markdown fences in case the model misbehaves
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean) as {
            fps: { low: number; med: number; high: number; ultra: number };
            note: string | null;
        };

        const { fps, note } = parsed;

        if (
            ![fps?.low, fps?.med, fps?.high, fps?.ultra].every(
                (value) =>
                    typeof value === 'number' &&
                    Number.isFinite(value) &&
                    value > 0 &&
                    Math.round(value) > 0,
            )
        ) {
            throw new Error('Missing or invalid fps fields in Gemini response');
        }

        return {
            fps: {
                low: Math.round(fps.low),
                med: Math.round(fps.med),
                high: Math.round(fps.high),
                ultra: Math.round(fps.ultra),
            },
            note: typeof note === 'string' && note.length > 0 ? note : null,
        };
    }
}
