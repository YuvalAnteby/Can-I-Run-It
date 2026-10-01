import { Global, Module } from '@nestjs/common';

import { AbuseProtectionService } from './abuse-protection.service';

@Global()
@Module({
    providers: [AbuseProtectionService],
    exports: [AbuseProtectionService],
})
export class AbuseProtectionModule {}
