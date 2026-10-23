import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { recordTelemetryEvent } from '../observability/telemetry';

export type AbuseEvent =
    | 'rate_limit.ip'
    | 'rate_limit.global'
    | `provider.${'gemini' | 'rawg'}.${
          'budget' | 'concurrency' | 'timeout' | 'failure'}`;

type ProviderName = 'gemini' | 'rawg';

interface Window {
    count: number;
    resetAt: number;
}

interface ProviderState {
    budget: number;
    maxConcurrent: number;
    window: Window;
    active: number;
}

const WINDOW_MS = 60_000;

@Injectable()
export class AbuseProtectionService implements OnApplicationShutdown {
    // ponytail: process-local fixed windows; use a shared store before adding replicas.
    private readonly perIpLimit: number;
    private readonly globalLimit: number;
    private readonly geminiPerIpLimit: number;
    private readonly ipWindows = new Map<string, Window>();
    private readonly geminiIpWindows = new Map<string, Window>();
    private globalWindow: Window = { count: 0, resetAt: 0 };
    private nextCleanupAt = 0;
    private readonly providers: Record<ProviderName, ProviderState>;
    private readonly events = new Map<
        AbuseEvent,
        {
            count: number;
            pending: number;
            lastEmittedAt: number | null;
        }
    >();
    private readonly logger = new Logger(AbuseProtectionService.name);

    constructor(private readonly config: ConfigService) {
        this.perIpLimit = this.number(
            'EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE',
            10,
        );
        this.globalLimit = this.number(
            'EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE',
            100,
        );
        this.geminiPerIpLimit = this.number(
            'GEMINI_REQUESTS_PER_IP_PER_MINUTE',
            5,
        );
        this.providers = {
            gemini: {
                budget: this.number('GEMINI_REQUESTS_PER_MINUTE', 30),
                maxConcurrent: this.number('GEMINI_MAX_CONCURRENT', 2),
                window: { count: 0, resetAt: 0 },
                active: 0,
            },
            rawg: {
                budget: this.number('RAWG_REQUESTS_PER_MINUTE', 60),
                maxConcurrent: this.number('RAWG_MAX_CONCURRENT', 4),
                window: { count: 0, resetAt: 0 },
                active: 0,
            },
        };
    }

    consumeExpensiveRequest(ip: string): number | null {
        const now = Date.now();
        this.cleanupIpWindows(now);
        if (now >= this.globalWindow.resetAt) {
            this.globalWindow = { count: 0, resetAt: now + WINDOW_MS };
        }
        if (this.globalWindow.count >= this.globalLimit) {
            this.recordEvent('rate_limit.global');
            return this.retryAfter(this.globalWindow.resetAt, now);
        }

        const window = this.windowFor(this.ipWindows, ip, now);
        if (window.count >= this.perIpLimit) {
            this.recordEvent('rate_limit.ip');
            return this.retryAfter(window.resetAt, now);
        }

        window.count += 1;
        this.globalWindow.count += 1;
        return null;
    }

    /** `ip` caps Gemini calls per client so a few IPs cannot drain the shared budget. */
    tryAcquireProvider(
        provider: ProviderName,
        ip?: string,
    ): (() => void) | null {
        const state = this.providers[provider];
        const now = Date.now();
        if (now >= state.window.resetAt) {
            state.window = { count: 0, resetAt: now + WINDOW_MS };
        }
        if (state.active >= state.maxConcurrent) {
            this.recordEvent(`provider.${provider}.concurrency`);
            return null;
        }
        let ipWindow: Window | undefined;
        if (provider === 'gemini' && ip) {
            this.cleanupIpWindows(now);
            ipWindow = this.windowFor(this.geminiIpWindows, ip, now);
        }
        if (
            state.window.count >= state.budget ||
            (ipWindow && ipWindow.count >= this.geminiPerIpLimit)
        ) {
            this.recordEvent(`provider.${provider}.budget`);
            return null;
        }

        state.active += 1;
        state.window.count += 1;
        if (ipWindow) ipWindow.count += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            state.active -= 1;
        };
    }

    recordEvent(event: AbuseEvent): void {
        recordTelemetryEvent(event);
        const now = Date.now();
        const state = this.events.get(event) ?? {
            count: 0,
            pending: 0,
            lastEmittedAt: null,
        };
        state.count += 1;
        if (state.lastEmittedAt === null) {
            state.lastEmittedAt = now;
            this.logger.warn({ event, count: 1 });
        } else if (now - state.lastEmittedAt >= WINDOW_MS) {
            this.logger.warn({ event, count: state.pending + 1 });
            state.pending = 0;
            state.lastEmittedAt = now;
        } else {
            state.pending += 1;
        }
        this.events.set(event, state);
    }

    onApplicationShutdown(): void {
        for (const [event, state] of this.events) {
            if (state.pending > 0) {
                this.logger.warn({ event, count: state.pending });
                state.pending = 0;
            }
        }
    }

    private number(key: string, fallback: number): number {
        return this.config.get<number>(key) ?? fallback;
    }

    private cleanupIpWindows(now: number): void {
        if (now < this.nextCleanupAt) return;
        for (const windows of [this.ipWindows, this.geminiIpWindows]) {
            for (const [ip, window] of windows) {
                if (window.resetAt <= now) windows.delete(ip);
            }
        }
        this.nextCleanupAt = now + WINDOW_MS;
    }

    private windowFor(
        windows: Map<string, Window>,
        ip: string,
        now: number,
    ): Window {
        let window = windows.get(ip);
        if (!window || now >= window.resetAt) {
            window = { count: 0, resetAt: now + WINDOW_MS };
            windows.set(ip, window);
        }
        return window;
    }

    private retryAfter(resetAt: number, now: number): number {
        return Math.max(1, Math.ceil((resetAt - now) / 1_000));
    }
}
