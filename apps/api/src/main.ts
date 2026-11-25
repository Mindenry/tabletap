import 'reflect-metadata';
import './config/load-env';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { env, validateEnv } from './config/env';

async function bootstrap(): Promise<void> {
  validateEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [],
  });

  app.use(
    helmet({
      // Images and exports are served from a different origin in local dev.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TableTap API')
    .setDescription(
      'Multi-tenant restaurant ordering, kitchen and POS API. All money values are decimal strings in THB.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('tt_at')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(`TableTap API listening on ${env.apiUrl} (env=${env.nodeEnv})`);
  logger.log(`Swagger: ${env.apiUrl}/api/docs`);
}

void bootstrap();
