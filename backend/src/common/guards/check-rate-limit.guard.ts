import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';

export class TooManyRequestsException extends HttpException {
    constructor() {
        super('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
}

@Injectable()
export class CheckRateLimitGuard implements CanActivate {
    // ponytail: per-process limits; use a shared store when running multiple replicas.
    private readonly windows = new Map<
        string,
        { count: number; resetAt: number }
    >();
    private nextCleanupAt = 0;

    canActivate(context: ExecutionContext): boolean {
        const now = Date.now();
        if (now >= this.nextCleanupAt) {
            for (const [ip, window] of this.windows) {
                if (window.resetAt <= now) this.windows.delete(ip);
            }
            this.nextCleanupAt = now + 60_000;
        }

        const http = context.switchToHttp();
        const request = http.getRequest<Request>();
        const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
        let window = this.windows.get(ip);
        if (!window || now >= window.resetAt) {
            window = { count: 0, resetAt: now + 60_000 };
            this.windows.set(ip, window);
        }

        if (window.count >= 10) {
            http.getResponse<Response>().setHeader(
                'Retry-After',
                Math.ceil((window.resetAt - now) / 1_000),
            );
            throw new TooManyRequestsException();
        }
        window.count += 1;
        return true;
    }
}
