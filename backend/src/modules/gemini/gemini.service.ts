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

const GEMINI_TIMEOUT_MS = 10_000;

interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
    }>;
}

@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private readonly apiKey: string | undefined;
    private readonly apiUrl =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    constructor(private readonly config: ConfigService) {
        this.apiKey = this.config.get<string>('GEMINI_API_KEY');
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
            this.logger.debug(`Raw Gemini response: ${raw}`);
        } catch (err: unknown) {
            this.logger.error(
                'Gemini API call failed',
                err instanceof Error ? err.stack : String(err),
            );
            return null;
        }

        try {
            return this.parseResponse(raw);
        } catch (err: unknown) {
            this.logger.error('Failed to parse Gemini response', { raw, err });
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey!,
                },
                signal: controller.signal,
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ parts: [{ text: userPrompt }] }],
                    generationConfig: {
                        temperature: 0.2, // Low temp → more consistent numeric estimates
                        maxOutputTokens: 200,
                    },
                }),
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Gemini HTTP ${response.status}: ${body}`);
        }

        const json = (await response.json()) as GeminiResponse;
        // Gemini wraps the model output under candidates[0].content.parts[0].text
        const text: string | undefined =
            json?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('Unexpected Gemini response shape');
        }

        return text.trim();
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
            typeof fps?.low !== 'number' ||
            typeof fps?.med !== 'number' ||
            typeof fps?.high !== 'number' ||
            typeof fps?.ultra !== 'number'
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
