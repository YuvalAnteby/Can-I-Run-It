import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminGuard } from './admin.guard';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginRateLimitGuard } from './admin-login-rate-limit.guard';

@Module({
    imports: [ConfigModule],
    controllers: [AdminAuthController],
    providers: [AdminAuthService, AdminGuard, AdminLoginRateLimitGuard],
    exports: [AdminAuthService, AdminGuard],
})
export class AdminAuthModule {}
