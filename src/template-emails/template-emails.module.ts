import { Module } from '@nestjs/common';
import { TemplateEmailsController } from './template-emails.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TemplateEmailsService } from './services/template-emails.service';
import { FormAuditService } from './services/form-audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [TemplateEmailsController],
  providers: [TemplateEmailsService,FormAuditService],
  exports: [TemplateEmailsService], // Export the service so CronSchedulerModule can use it
})
export class TemplateEmailsModule {}