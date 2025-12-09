import { NestFactory } from '@nestjs/core';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Global Prefix
    app.setGlobalPrefix('api');

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
    SwaggerModule.setup('swagger', app, documentFactory);

    // Start the server
    await app
        .listen(process.env.PORT ?? 4000)
        .then(() => {
            console.log(
                `NestJS is running on port ${process.env.PORT ?? 4000}`,
            );
        })
        .catch((err) => {
            console.error('Error starting the NestJS:', err);
            process.exit(1);
        });
}

void bootstrap();
