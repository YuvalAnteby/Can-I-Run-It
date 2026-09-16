import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMqService } from './rabbitmq.service';

@Module({
    imports: [ConfigModule],
    providers: [Logger, RabbitMqService],
    exports: [RabbitMqService],
})
export class MessagingModule {}
