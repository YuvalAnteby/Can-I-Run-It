import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    const configService = app.get(ConfigService);

    app.enableShutdownHooks();
    // Trust one verified ingress hop only when direct listener bypass is blocked.
    if (configService.get<string>('TRUST_PROXY') === '1') {
        app.set('trust proxy', 1);
    }

    // Global Prefix
    app.setGlobalPrefix('api');

    // CORS Policy
    const frontendUrl = process.env.REACT_URL;
    app.enableCors({
        origin:
            process.env.NODE_ENV === 'production'
                ? frontendUrl
                    ? [frontendUrl]
                    : []
                : [frontendUrl || 'http://react', 'http://localhost:3000'],
        credentials: true,
    });

    // Enable endpoint versioning
    app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: '1',
    });

    // Global Validation Pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true, // Strips properties not in the DTO
            transform: true, // Automatically converts types based on TS design type
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    // Swagger Setup
    const config = new DocumentBuilder()
        .setTitle('CIRI API')
        .setDescription('API documentation for CIRI application')
        .setVersion('1.0')
        .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/api/docs', app, documentFactory);

    const logger = new Logger('Bootstrap');

    // Start the server
    await app
        .listen(process.env.PORT ?? 4000)
        .then(() => {
            logger.log(`NestJS is running on port ${process.env.PORT ?? 4000}`);
        })
        .catch((err) => {
            logger.error('Error starting the NestJS:', err);
            process.exit(1);
        });
}

void bootstrap();
