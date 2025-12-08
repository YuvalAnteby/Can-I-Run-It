import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Server } from 'net';

interface HealthResponse {
  status: string;
  info: Record<string, any>;
  error: Record<string, any>;
  details: Record<string, any>;
}

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health/postgres (GET)', () => {
    return request(app.getHttpServer() as Server)
      .get('/health/postgres')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthResponse;

        expect(body).toHaveProperty('status', 'ok');
        expect(body).toHaveProperty('info');
        expect(body.info).toHaveProperty('database');
        expect(body.info.database).toHaveProperty('status', 'up');
      });
  });
});
