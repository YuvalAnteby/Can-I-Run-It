import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdminSession, IssuedAdminSession } from './admin-auth.types';

const SESSION_TTL_MS = 30 * 60 * 1_000;
const MAX_SESSIONS = 100;
const KEY_LENGTH = 64;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^scrypt:16384:8:1:([0-9a-f]{32}):([0-9a-f]{128})$/;

interface StoredSession {
    username: string;
    expiresAtMs: number;
}

interface ParsedPasswordHash {
    salt: Buffer;
    key: Buffer;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(derivedKey);
        });
    });
}

function invalidConfiguration(setting: string): Error {
    return new Error(`Invalid admin auth configuration: ${setting}`);
}

function parsePasswordHash(value: string): ParsedPasswordHash {
    const match = HASH_PATTERN.exec(value);
    if (!match) throw invalidConfiguration('ADMIN_PASSWORD_HASH');

    return {
        salt: Buffer.from(match[1], 'hex'),
        key: Buffer.from(match[2], 'hex'),
    };
}

function parseFrontendOrigin(value: string, production: boolean): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw invalidConfiguration('REACT_URL');
    }

    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin === 'null' ||
        value !== url.origin ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        (production && url.protocol !== 'https:')
    ) {
        throw invalidConfiguration('REACT_URL');
    }

    return url.origin;
}

@Injectable()
export class AdminAuthService {
    private readonly adminUsername: string;
    private readonly expectedKey: Buffer;
    private readonly salt: Buffer;
    private readonly frontendOrigin: string;

    // ponytail: one-replica memory store; use PostgreSQL-backed sessions when replicas or restart persistence matter.
    private readonly sessions = new Map<string, StoredSession>();

    constructor(private readonly config: ConfigService) {
        const username = this.config.get<string>('ADMIN_USERNAME') ?? '';
        const passwordHash =
            this.config.get<string>('ADMIN_PASSWORD_HASH') ?? '';
        const frontendUrl = this.config.get<string>('REACT_URL') ?? '';
        const missing = [
            !username?.trim() && 'ADMIN_USERNAME',
            !passwordHash && 'ADMIN_PASSWORD_HASH',
            !frontendUrl && 'REACT_URL',
        ].filter((setting): setting is string => Boolean(setting));
        if (missing.length) {
            throw new Error(
                `Missing admin auth configuration: ${missing.join(', ')}`,
            );
        }
        if (username.length > 100) {
            throw invalidConfiguration('ADMIN_USERNAME');
        }

        const parsedHash = parsePasswordHash(passwordHash);
        this.adminUsername = username;
        this.expectedKey = parsedHash.key;
        this.salt = parsedHash.salt;
        this.frontendOrigin = parseFrontendOrigin(
            frontendUrl,
            this.config.get<string>('NODE_ENV') === 'production',
        );
    }

    async login(
        username: string,
        password: string,
        previousToken?: string,
    ): Promise<IssuedAdminSession> {
        const candidate = await deriveKey(password, this.salt);
        const matches = timingSafeEqual(candidate, this.expectedKey);

        if (username !== this.adminUsername || !matches) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const now = Date.now();
        this.deleteExpired(now);
        if (previousToken && TOKEN_PATTERN.test(previousToken)) {
            this.sessions.delete(this.digest(previousToken));
        }
        if (this.sessions.size >= MAX_SESSIONS) {
            const oldest = this.sessions.keys().next();
            if (!oldest.done) this.sessions.delete(oldest.value);
        }

        const token = randomBytes(32).toString('base64url');
        const expiresAtMs = now + SESSION_TTL_MS;
        this.sessions.set(this.digest(token), {
            username: this.adminUsername,
            expiresAtMs,
        });

        return {
            token,
            session: {
                username: this.adminUsername,
                expiresAt: new Date(expiresAtMs).toISOString(),
            },
        };
    }

    getSession(token: string | undefined): AdminSession {
        if (!token || !TOKEN_PATTERN.test(token)) {
            throw new UnauthorizedException('Invalid session');
        }

        const digest = this.digest(token);
        const stored = this.sessions.get(digest);
        if (!stored || stored.expiresAtMs <= Date.now()) {
            if (stored) this.sessions.delete(digest);
            throw new UnauthorizedException('Invalid session');
        }

        return {
            username: stored.username,
            expiresAt: new Date(stored.expiresAtMs).toISOString(),
        };
    }

    logout(token: string | undefined): void {
        if (token && TOKEN_PATTERN.test(token)) {
            this.sessions.delete(this.digest(token));
        }
    }

    assertOrigin(origin: string | undefined): void {
        if (origin !== this.frontendOrigin) {
            throw new ForbiddenException('Invalid origin');
        }
    }

    private deleteExpired(now: number): void {
        for (const [digest, session] of this.sessions) {
            if (session.expiresAtMs <= now) this.sessions.delete(digest);
        }
    }

    private digest(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}
