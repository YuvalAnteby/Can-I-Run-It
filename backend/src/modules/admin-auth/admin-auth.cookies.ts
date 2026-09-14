import { parse } from 'cookie';

import { ADMIN_SESSION_COOKIE_NAME } from './admin-auth.types';

export function readAdminSessionToken(
    cookieHeader: string | undefined,
): string | undefined {
    if (!cookieHeader) return undefined;

    try {
        return parse(cookieHeader)[ADMIN_SESSION_COOKIE_NAME];
    } catch {
        return undefined;
    }
}
