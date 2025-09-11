import { Module } from '@nestjs/common';
import { CronSchedulerService } from './cron-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TemplateEmailsModule } from '../template-emails/template-emails.module';

@Module({
  imports: [
    PrismaModule, // Import PrismaModule for database access
    TemplateEmailsModule, // Import to use TemplateEmailsService
  ],
  providers: [CronSchedulerService],
  exports: [CronSchedulerService], // Export in case other modules need it
})
export class CronSchedulerModule {}