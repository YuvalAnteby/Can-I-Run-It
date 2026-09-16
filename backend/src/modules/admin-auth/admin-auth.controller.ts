import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res,
    UseGuards,
    Version,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ApiBadRequestResponse,
    ApiCookieAuth,
    ApiForbiddenResponse,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AdminGuard } from './admin.guard';
import { readAdminSessionToken } from './admin-auth.cookies';
import { AdminAuthService } from './admin-auth.service';
import type { AdminRequest, AdminSession } from './admin-auth.types';
import {
    ADMIN_SESSION_COOKIE_NAME,
    ADMIN_SESSION_MAX_AGE_SECONDS,
} from './admin-auth.types';
import { AdminLoginRateLimitGuard } from './admin-login-rate-limit.guard';
import { AdminLoginDto } from './dto/admin-login.dto';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
    private readonly secureCookies: boolean;

    constructor(
        private readonly adminAuthService: AdminAuthService,
        config: ConfigService,
    ) {
        this.secureCookies = config.get<string>('NODE_ENV') === 'production';
    }

    @Post('login')
    @Version('1')
    @HttpCode(HttpStatus.OK)
    @UseGuards(AdminLoginRateLimitGuard)
    @ApiOperation({ summary: 'Sign in as the configured administrator' })
    @ApiOkResponse({
        schema: {
            example: {
                username: 'admin',
                expiresAt: '2026-01-01T00:30:00.000Z',
            },
        },
    })
    @ApiBadRequestResponse({ description: 'Invalid login input' })
    @ApiForbiddenResponse({ description: 'Origin is not allowed' })
    @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
    @ApiTooManyRequestsResponse({ description: 'Login rate limit exceeded' })
    async login(
        @Body() dto: AdminLoginDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<AdminSession> {
        response.setHeader('Cache-Control', 'no-store');
        this.adminAuthService.assertOrigin(request.headers.origin);
        const issued = await this.adminAuthService.login(
            dto.username,
            dto.password,
            readAdminSessionToken(request.headers.cookie),
        );
        response.cookie(ADMIN_SESSION_COOKIE_NAME, issued.token, {
            ...this.cookieOptions(),
            maxAge: ADMIN_SESSION_MAX_AGE_SECONDS * 1_000,
        });
        return issued.session;
    }

    @Get('session')
    @Version('1')
    @UseGuards(AdminGuard)
    @ApiCookieAuth(ADMIN_SESSION_COOKIE_NAME)
    @ApiOperation({ summary: 'Get the current administrator session' })
    @ApiOkResponse({
        schema: {
            example: {
                username: 'admin',
                expiresAt: '2026-01-01T00:30:00.000Z',
            },
        },
    })
    @ApiUnauthorizedResponse({ description: 'Session is missing or expired' })
    getSession(
        @Req() request: AdminRequest,
        @Res({ passthrough: true }) response: Response,
    ): AdminSession {
        response.setHeader('Cache-Control', 'no-store');
        return request.admin as AdminSession;
    }

    @Post('logout')
    @Version('1')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Revoke the current administrator session' })
    @ApiNoContentResponse()
    @ApiForbiddenResponse({ description: 'Origin is not allowed' })
    logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): void {
        response.setHeader('Cache-Control', 'no-store');
        this.adminAuthService.assertOrigin(request.headers.origin);
        this.adminAuthService.logout(
            readAdminSessionToken(request.headers.cookie),
        );
        response.clearCookie(ADMIN_SESSION_COOKIE_NAME, this.cookieOptions());
    }

    private cookieOptions() {
        return {
            httpOnly: true,
            secure: this.secureCookies,
            sameSite: 'strict' as const,
            path: '/api',
        };
    }
}
