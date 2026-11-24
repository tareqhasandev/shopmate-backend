import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Store-Id'],
    credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  const publicTestApi = config.get<boolean>('SHOPMATE_PUBLIC_TEST_API', false) === true;
  const swaggerConfig = new DocumentBuilder()
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'bearer')
    .setTitle('ShopMate AI Commerce API')
    .setDescription(
      'Catalog, inventory, customer registration, cart and draft-order REST API. Draft orders never initiate payment. ' +
      (publicTestApi
        ? 'PUBLIC TEST MODE IS ON: every REST operation is callable without a bearer token, but requests are restricted to the configured ShopMate test store. Anyone who can reach this API can read and change that demo store; do not use real customer, store, or production data. Set SHOPMATE_PUBLIC_TEST_API=false to restore authentication for writes and private reads.'
        : 'Public test mode is off. Catalog, health and Swagger reads are public; writes and private inventory/cart/order reads require the ShopMate bearer token. Enable SHOPMATE_PUBLIC_TEST_API=true only for a disposable test store.')
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Mirror the global API guard: only catalog, health, and documentation reads are public by default.
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    const routePath = path.replace(/^\/api(?=\/)/, '');
    const operations = pathItem as unknown as Record<string, { security?: Array<Record<string, string[]>> } | undefined>;
    for (const method of methods) {
      const operation = operations[method];
      if (!operation) continue;
      const publicRead = (method === 'get' || method === 'head') && (
        routePath === '/health' || routePath === '/docs' || routePath.startsWith('/docs/') || routePath === '/docs-json' ||
        /^\/products(?:\/|$)/.test(routePath) || /^\/categories(?:\/|$)/.test(routePath)
      );
      if (!publicRead) operation.security = [{ bearer: [] }];
    }
  }
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: false },
  });

  const port = config.get<number>('PORT', 3001);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
