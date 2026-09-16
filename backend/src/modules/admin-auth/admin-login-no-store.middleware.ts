import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const ADMIN_LOGIN_PATH = '/api/v1/admin/auth/login';

export function installAdminLoginNoStoreMiddleware(
    app: INestApplication,
): void {
    app.use((request: Request, response: Response, next: NextFunction) => {
        if (request.method === 'POST' && request.path === ADMIN_LOGIN_PATH) {
            response.setHeader('Cache-Control', 'no-store');
        }
        next();
    });
}
