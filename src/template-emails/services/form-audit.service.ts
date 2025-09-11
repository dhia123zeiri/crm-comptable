import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

interface FormAccessLog {
  token: string;
  action: 'ACCESS' | 'SUBMIT' | 'ERROR';
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}

@Injectable()
export class FormAuditService {
  private readonly logger = new Logger(FormAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logFormAccess(logData: FormAccessLog) {
    try {
      // Log dans la base de données (vous pouvez créer une table audit_logs)
      this.logger.log(`Form ${logData.action}: ${logData.token} from ${logData.ipAddress}`);
      
      // Optionnel: créer une table d'audit
      /*
      await this.prisma.auditLog.create({
        data: {
          entityType: 'FORM',
          action: logData.action,
          token: logData.token,
          ipAddress: logData.ipAddress,
          userAgent: logData.userAgent,
          details: logData.details as any,
          createdAt: new Date()
        }
      });
      */
    } catch (error) {
      this.logger.error('Erreur lors du logging d\'audit:', error);
    }
  }

  async detectSuspiciousActivity(token: string, ipAddress: string): Promise<boolean> {
    try {
      // Vérifier le nombre d'accès par IP dans les dernières 24h
      const recentAccesses = await this.prisma.emailLog.count({
        where: {
          token,
          sentAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      });

      // Si plus de 10 accès avec le même token dans 24h = suspect
      return recentAccesses > 10;
    } catch (error) {
      this.logger.error('Erreur détection activité suspecte:', error);
      return false;
    }
  }
}