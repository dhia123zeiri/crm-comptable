import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MailerModule } from '@nestjs-modules/mailer';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

// Module imports
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ComptablesModule } from './comptables/comptables.module';
import { ClientsModule } from './clients/clients.module';
import { TemplateEmailsModule } from './template-emails/template-emails.module';
import { CronSchedulerModule } from './cron-scheduler/cron-scheduler.module';
import { DynamicFormsModule } from './dynamic-forms/dynamic-forms.module';

// Security middleware
import { FormSecurityMiddleware } from './common/middleware/form-security.middleware';
import { DocumentsModule } from './documents/documents.module';
import { DossierModule } from './dossier/dossier.module';
import { CaissesModule } from './caisses/caisses.module';
import { FacturesModule } from './factures/factures.module';
import { CheckoutModule } from './checkout/checkout.module';
import { FormResponsesModule } from './form-responses/form-responses.module';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Global rate limiting with Throttler
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          name: 'short',
          ttl: 60000, // 1 minute
          limit: 30, // 30 requêtes par minute
        },
        {
          name: 'medium',
          ttl: 600000, // 10 minutes
          limit: 100, // 100 requêtes par 10 minutes
        },
        {
          name: 'long',
          ttl: 3600000, // 1 heure
          limit: 300, // 300 requêtes par heure
        }
      ],
      inject: [ConfigService],
    }),

    // Enable the scheduler module (REQUIRED for cron jobs)
    ScheduleModule.forRoot(),

    // Configure mailer globally with Mailtrap variables
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAILTRAP_HOST') || 'smtp.mailtrap.io',
          port: parseInt(configService.get<string>('MAILTRAP_PORT') ?? '2525', 10),
          secure: false, // false for Mailtrap
          auth: {
            user: configService.get('MAILTRAP_USERNAME'),
            pass: configService.get('MAILTRAP_PASSWORD'),
          },
        },
        defaults: {
          from: configService.get('SMTP_FROM') || '"No Reply" <noreply@example.com>',
        },
      }),
      inject: [ConfigService],
    }),

    // Logger configuration
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            transport: isProduction ? undefined : {
              target: 'pino-pretty',
              options: {
                singleLine: true,
              },
            },
            level: isProduction ? 'info' : 'debug',
          }
        };
      },
      inject: [ConfigService],
    }),

    // Feature modules
    UsersModule,
    AuthModule,
    ComptablesModule,
    ClientsModule,
    TemplateEmailsModule, // This now includes FormController and security
    CronSchedulerModule,
    DynamicFormsModule,
    DocumentsModule,
    DossierModule,
    CaissesModule,
    FacturesModule,
    CheckoutModule,
    FormResponsesModule,
  ],
  controllers: [],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply form security middleware to all form-related routes
    consumer
      .apply(FormSecurityMiddleware)
      .forRoutes(
        { path: 'dynamic-forms/token/*', method: RequestMethod.GET },
        { path: 'dynamic-forms/submit/*', method: RequestMethod.POST },
        { path: 'dynamic-forms/status/*', method: RequestMethod.GET }
      );
  }
}