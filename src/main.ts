import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser'; // 👈 important
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔥 Augmenter la taille maximale du body
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Configuration CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',  // frontend Next.js
      'http://localhost:3001',  // backend (test)
      process.env.FRONTEND_URL, // Production
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin'
    ],
    credentials: false, // Passe à true si tu veux envoyer des cookies
  });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.use(cookieParser());

  await app.listen(app.get(ConfigService).getOrThrow('PORT'));
}
bootstrap();
