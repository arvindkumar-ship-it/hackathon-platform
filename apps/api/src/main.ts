import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { CsrfHeaderCheckMiddleware } from './common/middleware/csrf-header-check.middleware';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const prefix = configService.get<string>('API_PREFIX', 'api/v1');
  const webUrl = configService.get<string>('WEB_URL', 'http://localhost:3000');
  const port = configService.get<number>('PORT', 4000);

  app.setGlobalPrefix(prefix);

  app.enableCors({
    origin: webUrl,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Requested-With',
    ],
  });

  app.use(requestIdMiddleware);
  app.use(cookieParser());

  const csrfMiddleware = new CsrfHeaderCheckMiddleware(configService);
  app.use((req: any, res: any, next: any) => csrfMiddleware.use(req, res, next));

  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(app.get(MetricsInterceptor));

    if (configService.get<string>('ENABLE_SWAGGER') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hackathon Platform API')
      .setDescription('DesignArena Hackathon Platform API docs')
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

    for (const path of Object.values(swaggerDocument.paths)) {
      for (const operation of Object.values(path as Record<string, any>)) {
        if (operation && typeof operation === 'object') {
          operation.security = [{ bearer: [] }];
        }
      }
    }

    SwaggerModule.setup('api/docs', app, swaggerDocument, {
      swaggerOptions: {
        requestInterceptor: (req: any) => {
          req.headers['X-Requested-With'] = 'XMLHttpRequest';
          return req;
        },
      },
    });
  }

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
}

bootstrap();