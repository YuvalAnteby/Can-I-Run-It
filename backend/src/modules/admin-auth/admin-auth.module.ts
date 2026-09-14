import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminAuthService } from './admin-auth.service';

@Module({
    imports: [ConfigModule],
    providers: [AdminAuthService],
    exports: [AdminAuthService],
})
export class AdminAuthModule {}
