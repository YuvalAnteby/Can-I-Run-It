import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { readAdminSessionToken } from './admin-auth.cookies';
import { AdminAuthService } from './admin-auth.service';
import { AdminRequest } from './admin-auth.types';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly adminAuthService: AdminAuthService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<AdminRequest>();
        request.admin = undefined;

        if (MUTATING_METHODS.has(request.method.toUpperCase())) {
            this.adminAuthService.assertOrigin(request.headers.origin);
        }

        const session = this.adminAuthService.getSession(
            readAdminSessionToken(request.headers.cookie),
        );
        request.admin = session;
        return true;
    }
}
