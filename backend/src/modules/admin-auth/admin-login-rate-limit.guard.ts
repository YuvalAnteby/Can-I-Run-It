import { Injectable } from '@nestjs/common';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';

@Injectable()
export class AdminLoginRateLimitGuard extends CheckRateLimitGuard {}
