import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
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

  await app
    .listen(process.env.PORT ?? 4000)
    .then(() => {
      console.log(`NestJS is running on port ${process.env.PORT ?? 4000}`);
    })
    .catch((err) => {
      console.error('Error starting the NestJS:', err);
      process.exit(1);
    });
}

void bootstrap();
