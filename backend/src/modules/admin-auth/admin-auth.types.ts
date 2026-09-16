import type { Request } from 'express';

export const ADMIN_SESSION_COOKIE_NAME = 'ciri_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 1_800;

export interface AdminSession {
    username: string;
    expiresAt: string;
}

export interface IssuedAdminSession {
    token: string;
    session: AdminSession;
}

export interface AdminRequest extends Request {
    admin?: AdminSession;
}
