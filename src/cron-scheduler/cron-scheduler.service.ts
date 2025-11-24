// cron-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { TemplateEmailsService } from 'src/template-emails/services/template-emails.service';


@Injectable()
export class CronSchedulerService {
  private readonly logger = new Logger(CronSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEmailsService: TemplateEmailsService,
  ) {}

  // Main cron job - runs every minute to check for pending templates
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePeriodicTemplates() {
    const now = new Date();
    
    try {
      // Find templates that need to be executed
      const templatesToExecute = await this.prisma.template.findMany({
        where: {
          actif: true,
          isPeriodic: true,
          nextExecutionAt: {
            lte: now
          }
        },
        include: {
          comptable: {
            include: {
              user: {
                select: {
                  nom: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (templatesToExecute.length > 0) {
        this.logger.log(`🔍 Found ${templatesToExecute.length} templates to execute at ${now.toISOString()}`);
      }

      for (const template of templatesToExecute) {
        try {
          this.logger.log(`🚀 Executing periodic template: "${template.nom}" (ID: ${template.id})`);
          
          // Execute the template
          //const result = await this.templateEmailsService.executePeriodic(template.id);
          
          //this.logger.log(`✅ Template "${template.nom}" executed successfully. Sent: ${result.success}, Failed: ${result.failed}`);
          
        } catch (error) {
          this.logger.error(`❌ Failed to execute template ${template.id} ("${template.nom}"):`, error.message);
          
          // Update the template to avoid repeated failures - set next execution to 1 hour later
          try {
            await this.prisma.template.update({
              where: { id: template.id },
              data: {
                lastExecutionAt: new Date(),
                nextExecutionAt: new Date(Date.now() + 60 * 60 * 1000) // Retry in 1 hour
              }
            });
            this.logger.warn(`⏰ Template ${template.id} rescheduled for retry in 1 hour due to error`);
          } catch (updateError) {
            this.logger.error(`Failed to reschedule template ${template.id}:`, updateError.message);
          }
        }
      }
      
    } catch (error) {
      this.logger.error('💥 Critical error in periodic template scheduler:', error);
    }
  }

  // Optional: Health check cron - runs every 5 minutes to check scheduler status
  @Cron('*/5 * * * *')
  async healthCheck() {
    try {
      const activePeriodicTemplates = await this.prisma.template.count({
        where: {
          actif: true,
          isPeriodic: true
        }
      });

      const pendingExecutions = await this.prisma.template.count({
        where: {
          actif: true,
          isPeriodic: true,
          nextExecutionAt: {
            lte: new Date()
          }
        }
      });

      if (activePeriodicTemplates > 0) {
        this.logger.debug(`💓 Scheduler health: ${activePeriodicTemplates} active periodic templates, ${pendingExecutions} pending executions`);
      }

    } catch (error) {
      this.logger.error('Health check failed:', error);
    }
  }
}
