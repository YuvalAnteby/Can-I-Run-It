import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { AdminAuthService } from './admin-auth.service';

@Injectable()
export class AdminLoginRateLimitGuard extends CheckRateLimitGuard {
    constructor(private readonly adminAuthService: AdminAuthService) {
        super();
    }

    override canActivate(context: ExecutionContext): boolean {
        const http = context.switchToHttp();
        const response = http.getResponse<Response>();
        response.setHeader('Cache-Control', 'no-store');
        const request = http.getRequest<Request>();
        this.adminAuthService.assertOrigin(request.headers.origin);
        return super.canActivate(context);
    }
}
