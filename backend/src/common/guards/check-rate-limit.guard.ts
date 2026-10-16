import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { AbuseProtectionService } from '../abuse-protection/abuse-protection.service';

export class TooManyRequestsException extends HttpException {
    constructor() {
        super('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
}

/**
 * A guard that checks the rate limit for incoming requests based on the client's IP address.
 * Used mostly for Gemini API requests, which are not authenticated and thus cannot be rate-limited per user.
 */
@Injectable()
export class CheckRateLimitGuard implements CanActivate {
    constructor(private readonly abuseProtection: AbuseProtectionService) {}

    canActivate(context: ExecutionContext): boolean {
        const http = context.switchToHttp();
        const request = http.getRequest<Request>();
        const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
        const retryAfter = this.abuseProtection.consumeExpensiveRequest(ip);
        if (retryAfter !== null) {
            http.getResponse<Response>().setHeader('Retry-After', retryAfter);
            throw new TooManyRequestsException();
        }
        return true;
    }
}
