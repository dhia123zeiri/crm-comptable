import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTemplateDto, DuplicateTemplateDto, UpdateTemplateDto, DynamicFormFieldDto } from '../dto/template.request';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { FormAuditService } from './form-audit.service';

// Helper function to validate and parse cron expressions using @nestjs/schedule
function validateCronExpression(cronExpression: string): Date | null {
  try {
    // Basic cron validation - check format (5 or 6 parts)
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      throw new Error('Invalid cron format - must have 5 or 6 parts');
    }

    // Validate each part contains valid characters
    const validCronChars = /^[0-9\*\-\,\/\?LW#]+$/;
    for (const part of parts) {
      if (!validCronChars.test(part)) {
        throw new Error(`Invalid cron part: ${part}`);
      }
    }

    // Calculate next execution (simple approximation for common patterns)
    const nextExecution = new Date();
    
    // For testing and common patterns
    if (cronExpression.includes('*/1') || cronExpression === '* * * * *') {
      nextExecution.setMinutes(nextExecution.getMinutes() + 1);
    } else if (cronExpression.includes('*/5')) {
      nextExecution.setMinutes(nextExecution.getMinutes() + 5);
    } else if (cronExpression.includes('*/10')) {
      nextExecution.setMinutes(nextExecution.getMinutes() + 10);
    } else if (cronExpression.includes('*/30')) {
      nextExecution.setMinutes(nextExecution.getMinutes() + 30);
    } else if (cronExpression.includes('0 * * * *')) {
      nextExecution.setHours(nextExecution.getHours() + 1, 0, 0, 0);
    } else if (cronExpression.includes('0 0 * * *')) {
      nextExecution.setDate(nextExecution.getDate() + 1);
      nextExecution.setHours(0, 0, 0, 0);
    } else {
      // Default: add 1 hour for other patterns
      nextExecution.setHours(nextExecution.getHours() + 1);
    }
    
    console.log(`✅ Cron validated: ${cronExpression} -> Next: ${nextExecution}`);
    return nextExecution;
    
  } catch (error) {
    console.error('❌ Cron validation error:', error.message);
    return null;
  }
}

// Helper function to get predefined cron expressions
function getPredefinedCronExpression(type: string): string | null {
  const expressions = {
    'daily': CronExpression.EVERY_DAY_AT_MIDNIGHT,
    'weekly': CronExpression.EVERY_WEEK,
    'monthly': CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT,
    'quarterly': '0 0 1 */3 *',
    'yearly': CronExpression.EVERY_YEAR,
    'hourly': CronExpression.EVERY_HOUR,
    'every_30_minutes': CronExpression.EVERY_30_MINUTES,
    'every_10_minutes': CronExpression.EVERY_10_MINUTES,
    'weekdays': CronExpression.MONDAY_TO_FRIDAY_AT_1AM,
    'instant_test': '*/1 * * * *', // Every minute for testing
  };
  
  const result = expressions[type] || null;
  console.log(`🔍 getPredefinedCronExpression('${type}') -> '${result}'`);
  return result;
}

interface PersonalizedContent {
  subject: string;
  content: string;
}

interface SendResult {
  clientId: number;
  clientName: string;
  email: string;
  status: 'sent' | 'failed';
  emailLogId?: number;
  messageId?: string;
  error?: string;
}

@Injectable()
export class TemplateEmailsService {
  private readonly logger = new Logger(TemplateEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly auditService:FormAuditService
  ) {}
  
  async create(createTemplateDto: CreateTemplateDto, userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
    }

    const existingTemplate = await this.prisma.template.findFirst({
      where: {
        nom: createTemplateDto.nom,
        comptableId: comptable.id
      }
    });

    if (existingTemplate) {
      throw new BadRequestException('Un template avec ce nom existe déjà pour ce comptable');
    }

    let nextExecutionAt: Date | null = null;
    if (createTemplateDto.isPeriodic && createTemplateDto.cronExpression) {
      console.log('=== CRON DEBUG START ===');
      console.log('Original cronExpression:', createTemplateDto.cronExpression);
      
      const predefinedCron = getPredefinedCronExpression(createTemplateDto.cronExpression);
      console.log('Predefined cron found:', predefinedCron);
      
      const cronToValidate = predefinedCron || createTemplateDto.cronExpression;
      console.log('Cron to validate:', cronToValidate);
      
      nextExecutionAt = validateCronExpression(cronToValidate);
      console.log('Validation result:', nextExecutionAt);
      console.log('=== CRON DEBUG END ===');
      
      if (!nextExecutionAt) {
        throw new BadRequestException('Expression cron invalide');
      }
    }

    const extractedVariables = this.extractVariables(
      createTemplateDto.subject + ' ' + createTemplateDto.content
    );
    
    let allVariables = [...new Set([...extractedVariables, ...(createTemplateDto.variables || [])])];
    
    // Add form_link variable if form is included
    if (createTemplateDto.includeForm && createTemplateDto.dynamicForm) {
      allVariables = [...new Set([...allVariables, 'form_link'])];
    }

    return await this.prisma.$transaction(async (prisma) => {
      let dynamicFormId: number | null = null;

      // Create dynamic form if included
      if (createTemplateDto.includeForm && createTemplateDto.dynamicForm) {
        if (createTemplateDto.dynamicForm.fields) {
          this.validateFormFields(createTemplateDto.dynamicForm.fields);
        }
        
        const dynamicForm = await prisma.dynamicForm.create({
          data: {
            title: createTemplateDto.dynamicForm.title,
            description: createTemplateDto.dynamicForm.description,
            fields: createTemplateDto.dynamicForm.fields as unknown as Prisma.InputJsonValue,
            expirationDays: createTemplateDto.dynamicForm.expirationDays || 30,
            requiresAuthentication: createTemplateDto.dynamicForm.requiresAuthentication ?? true,
            isActive: createTemplateDto.dynamicForm.isActive ?? true,
            comptableId: comptable.id,
          }
        });

        dynamicFormId = dynamicForm.id;
        this.logger.log(`Dynamic form created: ${dynamicForm.id} for template`);
      }

      const template = await prisma.template.create({
        data: {
          nom: createTemplateDto.nom,
          subject: createTemplateDto.subject,
          content: createTemplateDto.content,
          type: createTemplateDto.type,
          category: createTemplateDto.category,
          comptableId: comptable.id,
          variables: allVariables,
          usageCount: 0,
          actif: createTemplateDto.actif ?? true,
          isPeriodic: createTemplateDto.isPeriodic ?? false,
          cronExpression: createTemplateDto.cronExpression,
          nextExecutionAt: nextExecutionAt,
          includeForm: createTemplateDto.includeForm ?? false,
          dynamicFormId: dynamicFormId,
        },
      });

      // Handle client associations
      if (createTemplateDto.clientIds && createTemplateDto.clientIds.length > 0) {
        const validClients = await prisma.client.findMany({
          where: {
            id: { in: createTemplateDto.clientIds },
            comptableId: comptable.id
          }
        });

        if (validClients.length !== createTemplateDto.clientIds.length) {
          throw new BadRequestException('Certains clients sont introuvables ou ne vous appartiennent pas');
        }

        const templateClientData = createTemplateDto.clientIds.map(clientId => ({
          templateId: template.id,
          clientId: clientId
        }));

        await prisma.templateClient.createMany({
          data: templateClientData
        });
      } else if (createTemplateDto.sendToAllClients) {
        const allClients = await prisma.client.findMany({
          where: { comptableId: comptable.id },
          select: { id: true }
        });

        if (allClients.length > 0) {
          const templateClientData = allClients.map(client => ({
            templateId: template.id,
            clientId: client.id
          }));

          await prisma.templateClient.createMany({
            data: templateClientData
          });
        }
      }

      // Create periodic job if needed
      if (createTemplateDto.isPeriodic && createTemplateDto.cronExpression && nextExecutionAt) {
        const finalCronExpression = getPredefinedCronExpression(createTemplateDto.cronExpression) || createTemplateDto.cronExpression;
        
        await prisma.jobCron.create({
          data: {
            nom: `Template Périodique - ${createTemplateDto.nom}`,
            description: `Envoi automatique du template "${createTemplateDto.nom}"`,
            expression: finalCronExpression,
            type: 'ENVOI_EMAIL_TEMPLATE',
            actif: true,
            prochaineExecution: nextExecutionAt,
            parametres: {
              templateId: template.id
            }
          }
        });
      }

      return await prisma.template.findUnique({
        where: { id: template.id },
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
          },
          clients: {
            include: {
              client: {
                select: {
                  id: true,
                  raisonSociale: true,
                  user: {
                    select: {
                      email: true
                    }
                  }
                }
              }
            }
          },
          dynamicForm: true
        }
      });
    });
  }

  async duplicate(id: number, duplicateTemplateDto: DuplicateTemplateDto, userId: number) {
    const originalTemplate = await this.findOne(id);

    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
    }

    const newName = duplicateTemplateDto.nom || `${originalTemplate.nom} (Copie)`;
    const existingTemplate = await this.prisma.template.findFirst({
      where: {
        nom: newName,
        comptableId: comptable.id
      }
    });

    if (existingTemplate) {
      throw new BadRequestException('Un template avec ce nom existe déjà pour ce comptable');
    }

    // Prepare duplicate data
    const duplicatedData: CreateTemplateDto = {
      nom: newName,
      subject: originalTemplate.subject,
      content: originalTemplate.content,
      type: originalTemplate.type,
      category: originalTemplate.category,
      variables: originalTemplate.variables,
      actif: true,
      isPeriodic: false,
      cronExpression: undefined,
      clientIds: originalTemplate.clients.map(tc => tc.client.id),
      sendToAllClients: false,
      includeForm: !!originalTemplate.dynamicForm,
      dynamicForm: originalTemplate.dynamicForm ? {
        title: `${originalTemplate.dynamicForm.title} (Copie)`,
        description: originalTemplate.dynamicForm.description ?? undefined,
        fields: originalTemplate.dynamicForm.fields as any,
        expirationDays: originalTemplate.dynamicForm.expirationDays,
        requiresAuthentication: originalTemplate.dynamicForm.requiresAuthentication,
        isActive: true
      } : undefined
    };

    return this.create(duplicatedData, userId);
  }

  async findAll(userId?: number) {
    let where: any = {};

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (comptable) {
        where = { comptableId: comptable.id };
      }
    }

    return this.prisma.template.findMany({
      where,
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
        },
        clients: {
          include: {
            client: {
              select: {
                id: true,
                raisonSociale: true
              }
            }
          }
        },
        dynamicForm: {
          select: {
            id: true,
            title: true,
            isActive: true,
            fields: true,
            _count: {
              select: {
                responses: true
              }
            }
          }
        },
        _count: {
          select: {
            clients: true,
            emailLogs: true
          }
        }
      },
      orderBy: {
        dateCreation: 'desc'
      }
    });
  }

  async findOne(id: number) {
    const template = await this.prisma.template.findUnique({
      where: { id },
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
        },
        clients: {
          include: {
            client: {
              select: {
                id: true,
                raisonSociale: true,
                siret: true,
                user: {
                  select: {
                    email: true,
                    nom: true
                  }
                }
              }
            }
          }
        },
        dynamicForm: true,
        emailLogs: {
          orderBy: {
            sentAt: 'desc'
          },
          take: 5
        }
      }
    });

    if (!template) {
      throw new NotFoundException('Template non trouvé');
    }

    return template;
  }

  async update(id: number, updateTemplateDto: UpdateTemplateDto, userId?: number) {
    const currentTemplate = await this.findOne(id);

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (!comptable) {
        throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
      }

      if (currentTemplate.comptableId !== comptable.id) {
        throw new BadRequestException('Vous n\'avez pas accès à ce template');
      }
    }

    if (updateTemplateDto.nom && updateTemplateDto.nom !== currentTemplate.nom) {
      const existingTemplate = await this.prisma.template.findFirst({
        where: {
          nom: updateTemplateDto.nom,
          comptableId: currentTemplate.comptableId,
          id: { not: id }
        }
      });

      if (existingTemplate) {
        throw new BadRequestException('Un template avec ce nom existe déjà');
      }
    }

    let nextExecutionAt: Date | undefined;
    if (updateTemplateDto.cronExpression) {
      const predefinedCron = getPredefinedCronExpression(updateTemplateDto.cronExpression);
      const cronToValidate = predefinedCron || updateTemplateDto.cronExpression;
      
      const validatedDate = validateCronExpression(cronToValidate);
      if (!validatedDate) {
        throw new BadRequestException('Expression cron invalide');
      }
      nextExecutionAt = validatedDate;
    }

    let variables = updateTemplateDto.variables;
    if (updateTemplateDto.subject || updateTemplateDto.content) {
      const newSubject = updateTemplateDto.subject || currentTemplate.subject;
      const newContent = updateTemplateDto.content || currentTemplate.content;
      
      const extractedVariables = this.extractVariables(newSubject + ' ' + newContent);
      variables = [...new Set([...extractedVariables, ...(variables || [])])];
      
      // Add form_link variable if form is included
      if (updateTemplateDto.includeForm || currentTemplate.includeForm) {
        variables = [...new Set([...variables, 'form_link'])];
      }
    }

    return await this.prisma.$transaction(async (prisma) => {
      let dynamicFormId = currentTemplate.dynamicFormId;

      // Handle dynamic form updates
      if (updateTemplateDto.includeForm && updateTemplateDto.dynamicForm) {
        if (updateTemplateDto.dynamicForm.fields) {
          this.validateFormFields(updateTemplateDto.dynamicForm.fields);
        }

        if (currentTemplate.dynamicFormId) {
          // Update existing form - ensure title is not undefined
          const formUpdateData: Prisma.DynamicFormUpdateInput = {
            dateModification: new Date(),
          };

          if (updateTemplateDto.dynamicForm.title) {
            formUpdateData.title = updateTemplateDto.dynamicForm.title;
          }
          if (updateTemplateDto.dynamicForm.description !== undefined) {
            formUpdateData.description = updateTemplateDto.dynamicForm.description;
          }
          if (updateTemplateDto.dynamicForm.fields) {
            formUpdateData.fields = updateTemplateDto.dynamicForm.fields as unknown as Prisma.InputJsonValue;
          }
          if (updateTemplateDto.dynamicForm.expirationDays !== undefined) {
            formUpdateData.expirationDays = updateTemplateDto.dynamicForm.expirationDays;
          }
          if (updateTemplateDto.dynamicForm.requiresAuthentication !== undefined) {
            formUpdateData.requiresAuthentication = updateTemplateDto.dynamicForm.requiresAuthentication;
          }
          if (updateTemplateDto.dynamicForm.isActive !== undefined) {
            formUpdateData.isActive = updateTemplateDto.dynamicForm.isActive;
          }

          await prisma.dynamicForm.update({
            where: { id: currentTemplate.dynamicFormId },
            data: formUpdateData
          });
        } else {
          // Create new form - ensure title is provided
          if (!updateTemplateDto.dynamicForm.title) {
            throw new BadRequestException('Le titre du formulaire est requis');
          }

          const newForm = await prisma.dynamicForm.create({
            data: {
              title: updateTemplateDto.dynamicForm.title,
              description: updateTemplateDto.dynamicForm.description,
              fields: updateTemplateDto.dynamicForm.fields as unknown as Prisma.InputJsonValue,
              expirationDays: updateTemplateDto.dynamicForm.expirationDays || 30,
              requiresAuthentication: updateTemplateDto.dynamicForm.requiresAuthentication ?? true,
              isActive: updateTemplateDto.dynamicForm.isActive ?? true,
              comptableId: currentTemplate.comptableId,
            }
          });
          dynamicFormId = newForm.id;
        }
      } else if (updateTemplateDto.includeForm === false && currentTemplate.dynamicFormId) {
        // Remove form association and delete form if not used elsewhere
        const formUsageCount = await prisma.template.count({
          where: { 
            dynamicFormId: currentTemplate.dynamicFormId,
            id: { not: id }
          }
        });

        if (formUsageCount === 0) {
          await prisma.dynamicForm.delete({
            where: { id: currentTemplate.dynamicFormId }
          });
        }
        dynamicFormId = null;
      }

      // Prepare update data without dynamicForm property
      const { dynamicForm, ...templateUpdateData } = updateTemplateDto;
      
      const updatedTemplate = await prisma.template.update({
        where: { id },
        data: {
          ...templateUpdateData,
          ...(variables && { variables }),
          ...(nextExecutionAt && { nextExecutionAt }),
          dynamicFormId: dynamicFormId,
          includeForm: updateTemplateDto.includeForm ?? currentTemplate.includeForm,
          dateModification: new Date()
        }
      });

      // Handle client updates
      if (updateTemplateDto.clientIds !== undefined) {
        await prisma.templateClient.deleteMany({
          where: { templateId: id }
        });

        if (updateTemplateDto.clientIds.length > 0) {
          const validClients = await prisma.client.findMany({
            where: {
              id: { in: updateTemplateDto.clientIds },
              comptableId: currentTemplate.comptableId
            }
          });

          if (validClients.length !== updateTemplateDto.clientIds.length) {
            throw new BadRequestException('Certains clients sont introuvables ou ne vous appartiennent pas');
          }

          const templateClientData = updateTemplateDto.clientIds.map(clientId => ({
            templateId: id,
            clientId: clientId
          }));

          await prisma.templateClient.createMany({
            data: templateClientData
          });
        }
      } else if (updateTemplateDto.sendToAllClients) {
        await prisma.templateClient.deleteMany({
          where: { templateId: id }
        });

        const allClients = await prisma.client.findMany({
          where: { comptableId: currentTemplate.comptableId },
          select: { id: true }
        });

        if (allClients.length > 0) {
          const templateClientData = allClients.map(client => ({
            templateId: id,
            clientId: client.id
          }));

          await prisma.templateClient.createMany({
            data: templateClientData
          });
        }
      }

      return updatedTemplate;
    });
  }

  async remove(id: number, userId?: number) {
    const template = await this.findOne(id);

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (!comptable) {
        throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
      }

      if (template.comptableId !== comptable.id) {
        throw new BadRequestException('Vous ne pouvez pas supprimer ce template');
      }
    }

    return await this.prisma.$transaction(async (prisma) => {
      // Remove cron jobs
      await prisma.jobCron.deleteMany({
        where: {
          type: 'ENVOI_EMAIL_TEMPLATE',
          parametres: {
            path: ['templateId'],
            equals: id
          }
        }
      });

      // Check if dynamic form can be deleted
      if (template.dynamicFormId) {
        const formUsageCount = await prisma.template.count({
          where: { 
            dynamicFormId: template.dynamicFormId,
            id: { not: id }
          }
        });

        if (formUsageCount === 0) {
          await prisma.dynamicForm.delete({
            where: { id: template.dynamicFormId }
          });
        }
      }

      return await prisma.template.delete({
        where: { id }
      });
    });
  }

  async toggleStatus(id: number, userId?: number) {
    const template = await this.findOne(id);
    
    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (!comptable) {
        throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
      }

      if (template.comptableId !== comptable.id) {
        throw new BadRequestException('Vous n\'avez pas accès à ce template');
      }
    }
    
    return this.update(id, {
      actif: !template.actif
    }, userId);
  }

  async incrementUsage(id: number) {
    await this.findOne(id);
    
    return this.prisma.template.update({
      where: { id },
      data: {
        usageCount: {
          increment: 1
        }
      }
    });
  }

  async sendTemplate(templateId: number, userId?: number) {
    this.logger.debug('Mailer service status:', {
        isConfigured: !!this.mailerService,
        frontendUrl: this.configService.get('FRONTEND_URL')
    });
    
    const template = await this.findOne(templateId);

    this.logger.debug('Template data:', {
      id: template.id,
      name: template.nom,
      hasSubject: !!template.subject,
      hasContent: !!template.content,
      includeForm: template.includeForm,
      hasDynamicForm: !!template.dynamicForm,
      clientsCount: template.clients?.length || 0,
      comptableData: {
        hasComptable: !!template.comptable,
        hasUser: !!template.comptable?.user,
        hasEmail: !!template.comptable?.user?.email
      }
    });

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (!comptable || template.comptableId !== comptable.id) {
        throw new BadRequestException('Vous n\'avez pas accès à ce template');
      }
    }

    if (!template.actif) {
      throw new BadRequestException('Ce template n\'est pas actif');
    }

    if (template.clients.length === 0) {
      throw new BadRequestException('Aucun client associé à ce template');
    }

    // Check if form is required but not available
    if (template.includeForm && !template.dynamicForm) {
      throw new BadRequestException('Le formulaire dynamique associé est introuvable');
    }

    const results: SendResult[] = [];

    for (const templateClient of template.clients) {
      this.logger.debug(`Client ${templateClient.clientId} data:`, {
        hasClient: !!templateClient.client,
        hasUser: !!templateClient.client?.user,
        hasEmail: !!templateClient.client?.user?.email,
        email: templateClient.client?.user?.email,
        name: templateClient.client?.raisonSociale
      });
      
      if (!templateClient.actif) continue;

      try {
        const result = await this.sendEmailToClient(template, templateClient.client);
        results.push(result);
      } catch (error) {
        this.logger.error(`Erreur envoi template ${templateId} pour client ${templateClient.clientId}:`, error);
        results.push({
          clientId: templateClient.clientId,
          clientName: templateClient.client.raisonSociale,
          email: templateClient.client.user.email,
          status: 'failed',
          error: error.message
        });
      }
    }

    await this.incrementUsage(templateId);

    return {
      templateId,
      templateName: template.nom,
      totalClients: template.clients.length,
      success: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    };
  }

  async executePeriodic(templateId: number) {
    const template = await this.findOne(templateId);

    if (!template.actif || !template.isPeriodic) {
      throw new BadRequestException('Template non actif ou non périodique');
    }

    let nextExecutionAt: Date | null = null;
    if (template.cronExpression) {
      const predefinedCron = getPredefinedCronExpression(template.cronExpression);
      const cronToValidate = predefinedCron || template.cronExpression;
      
      nextExecutionAt = validateCronExpression(cronToValidate);
      if (!nextExecutionAt) {
        this.logger.error(`Erreur calcul prochaine exécution pour template ${templateId}`);
      }
    }

    await this.prisma.template.update({
      where: { id: templateId },
      data: {
        lastExecutionAt: new Date(),
        nextExecutionAt: nextExecutionAt
      }
    });

    const result = await this.sendTemplate(templateId);
    
    return result;
  }

  async getAvailableCronExpressions() {
    return {
      predefined: {
        'instant_test': { expression: '*/1 * * * *', description: 'Test instantané (chaque minute)' },
        'daily': { expression: CronExpression.EVERY_DAY_AT_MIDNIGHT, description: 'Tous les jours à minuit' },
        'weekly': { expression: CronExpression.EVERY_WEEK, description: 'Chaque semaine' },
        'monthly': { expression: CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, description: 'Chaque mois (1er jour)' },
        'quarterly': { expression: '0 0 1 */3 *', description: 'Chaque trimestre' },
        'yearly': { expression: CronExpression.EVERY_YEAR, description: 'Chaque année' },
        'hourly': { expression: CronExpression.EVERY_HOUR, description: 'Chaque heure' },
        'every_30_minutes': { expression: CronExpression.EVERY_30_MINUTES, description: 'Toutes les 30 minutes' },
        'every_10_minutes': { expression: CronExpression.EVERY_10_MINUTES, description: 'Toutes les 10 minutes' },
        'weekdays': { expression: CronExpression.MONDAY_TO_FRIDAY_AT_1AM, description: 'Jours de semaine à 1h' },
      },
      examples: [
        { expression: '0 9 * * 1', description: 'Chaque lundi à 9h00' },
        { expression: '0 14 1 * *', description: 'Le 1er de chaque mois à 14h00' },
        { expression: '0 18 * * 5', description: 'Chaque vendredi à 18h00' },
        { expression: '0 8 15 */3 *', description: 'Le 15 de chaque trimestre à 8h00' },
        { expression: '*/1 * * * *', description: 'Chaque minute (test)' },
      ]
    };
  }




  private async sendEmailToClient(template: any, client: any): Promise<SendResult> {
    const token = uuidv4();
    
    // Pass token to personalizeContent
    const personalizedContent = this.personalizeContent(template, client, token);
    
    const formUrl = template.includeForm && template.dynamicForm 
      ? `${this.configService.get('FRONTEND_URL')}/client-portal/${token}`
      : null;

    try {
      this.logger.debug('Sending email to:', client.user.email);
      if (formUrl) {
        this.logger.debug('Form URL:', formUrl);
      }
      
      const mailOptions = {
        to: client.user.email,
        from: {
          name: template.comptable.cabinet || template.comptable.user.nom,
          address: template.comptable.user.email,
        },
        subject: personalizedContent.subject,
        html: this.buildEmailTemplate(
          personalizedContent.content, 
          personalizedContent.subject, 
          formUrl, 
          template.comptable,
          template.includeForm
        ),
        headers: {
          'X-Template-ID': template.id.toString(),
          'X-Client-ID': client.id.toString(),
          'X-Comptable-ID': template.comptableId.toString(),
        },
      };

      this.logger.debug('Mail options:', JSON.stringify({
        to: mailOptions.to,
        from: mailOptions.from,
        subject: mailOptions.subject,
        headers: mailOptions.headers
      }, null, 2));

      const result = await this.mailerService.sendMail(mailOptions);
      
      const emailLog = await this.prisma.emailLog.create({
        data: {
          subject: personalizedContent.subject,
          content: personalizedContent.content,
          token,
          templateId: template.id,
          clientId: client.id,
          status: 'SENT',
          messageId: result.messageId,
          sentAt: new Date(),
        }
      });

      this.logger.log(`Template ${template.id} envoyé avec succès à ${client.user.email} - MessageID: ${result.messageId}`);

      return {
        clientId: client.id,
        clientName: client.raisonSociale,
        email: client.user.email,
        status: 'sent',
        emailLogId: emailLog.id,
        messageId: result.messageId,
      };

    } catch (error) {
      this.logger.error(`Erreur envoi email:`, error);
      
      const emailLog = await this.prisma.emailLog.create({
        data: {
          subject: personalizedContent.subject,
          content: personalizedContent.content,
          token,
          templateId: template.id,
          clientId: client.id,
          status: 'FAILED',
          error: error.message,
          sentAt: new Date(),
        }
      });

      throw error;
    }
  }

  private personalizeContent(template: any, client: any, token?: string): PersonalizedContent {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const quarter = Math.ceil(month / 3);

  let personalizedSubject = template.subject;
  let personalizedContent = template.content;

  // Create the actual form URL with token only if form is included
  const formUrl = template.includeForm && token 
    ? `${this.configService.get('FRONTEND_URL')}/client-portal/${token}`
    : null;

  template.variables.forEach((variable: string) => {
    const placeholder = `{${variable}}`;
    let replacement = '';

    switch (variable.toLowerCase()) {
      case 'client_name':
      case 'nom_client':
        replacement = client.raisonSociale;
        break;
      case 'client_email':
      case 'email':
        replacement = client.user?.email || '';
        break;
      case 'siret':
        replacement = client.siret || '';
        break;
      case 'contact_name':
      case 'nom_contact':
        replacement = client.user?.nom || client.raisonSociale;
        break;
      case 'address':
      case 'adresse':
        replacement = client.adresse || '';
        break;
      case 'postal_code':
      case 'code_postal':
        replacement = client.codePostal || '';
        break;
      case 'city':
      case 'ville':
        replacement = client.ville || '';
        break;
      case 'phone':
      case 'telephone':
        replacement = client.telephone || '';
        break;
      case 'activity_type':
      case 'type_activite':
        replacement = client.typeActivite || '';
        break;
      case 'fiscal_regime':
      case 'regime_fiscal':
        replacement = client.regimeFiscal || '';
        break;
      case 'date':
        replacement = currentDate.toLocaleDateString('fr-FR');
        break;
      case 'year':
      case 'annee':
        replacement = year.toString();
        break;
      case 'month':
      case 'mois':
        replacement = month.toString().padStart(2, '0');
        break;
      case 'quarter':
      case 'trimestre':
        replacement = quarter.toString();
        break;
      case 'month_name':
      case 'nom_mois':
        const monthNames = [
          'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        replacement = monthNames[month - 1];
        break;
      case 'last_connection':
      case 'derniere_connexion':
        replacement = client.derniereConnexion 
          ? new Date(client.derniereConnexion).toLocaleDateString('fr-FR')
          : 'Jamais';
        break;
      case 'form_link':
      case 'lien_formulaire':
        replacement = formUrl || 'Aucun formulaire disponible';
        break;
      default:
        replacement = placeholder;
        break;
    }

    // Escape curly braces for RegExp
    const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&');

    personalizedSubject = personalizedSubject.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
    personalizedContent = personalizedContent.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
  });

  return {
    subject: personalizedSubject,
    content: personalizedContent
  };
}


  private buildEmailTemplate(content: string, subject: string, formUrl: string | null, comptable: any, includeForm: boolean = false): string {
    // Process the content to handle line breaks and formatting
    const processedContent = content
      .replace(/\n/g, '<br>')
      .replace(/\r\n/g, '<br>')
      .replace(/\r/g, '<br>');

    // Show form button only if form is included and URL is valid
    const shouldShowFormButton = includeForm && formUrl && !formUrl.includes('{token}');

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0; 
          padding: 0; 
          background-color: #f4f4f4; 
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background: white; 
          border-radius: 10px; 
          overflow: hidden; 
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); 
        }
        .content { 
          padding: 30px; 
          background: white; 
        }
        .template-content {
          margin: 20px 0;
          line-height: 1.8;
          font-size: 16px;
        }
        .template-content p {
          margin: 15px 0;
        }
        .button { 
          display: inline-block; 
          background: linear-gradient(135deg, #8b5cf6, #7c3aed); 
          color: white; 
          padding: 15px 30px; 
          text-decoration: none; 
          border-radius: 8px; 
          margin: 25px 0; 
          font-weight: 600;
          text-align: center;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }
        .button:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
        }
        .button-container { text-align: center; margin: 30px 0; }
        .form-notice {
          background: linear-gradient(135deg, #f3e8ff, #e9d5ff);
          border: 1px solid #c4b5fd;
          border-radius: 8px;
          padding: 20px;
          margin: 25px 0;
          text-align: center;
        }
        .form-notice h3 {
          color: #7c3aed;
          margin: 0 0 10px 0;
          font-size: 18px;
        }
        .form-notice p {
          color: #6b46c1;
          margin: 0;
          font-size: 14px;
        }
        .template-content a {
          color: #3b82f6;
          text-decoration: none;
        }
        .template-content a:hover {
          text-decoration: underline;
        }
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
        }
        .security-badge {
          display: inline-flex;
          align-items: center;
          background: #dcfce7;
          color: #166534;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <div class="template-content">
            ${processedContent}
          </div>
          
          ${shouldShowFormButton ? `
          <div class="form-notice">
            <h3>📋 Formulaire Sécurisé Requis</h3>
            <p>Veuillez cliquer sur le bouton ci-dessous pour accéder à votre formulaire personnalisé.</p>
            <div class="security-badge">
              🔒 Lien sécurisé et temporaire
            </div>
          </div>
          
          <div class="button-container">
            <a href="${formUrl}" class="button">
              📝 Accéder au Formulaire Sécurisé
            </a>
          </div>
          ` : ''}
        </div>
        
        <div class="footer">
          <p><strong>${comptable.cabinet || comptable.user.nom}</strong></p>
          <p>Email: ${comptable.user.email}</p>
          <p><small>Cet email a été envoyé automatiquement. Merci de ne pas répondre directement à cet email.</small></p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  async getStats(userId?: number) {
    let where: any = {};

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (comptable) {
        where = { comptableId: comptable.id };
      }
    }

    const [total, actifs, periodiques, withForms, parType, emailStats] = await Promise.all([
      this.prisma.template.count({ where }),
      this.prisma.template.count({ where: { ...where, actif: true } }),
      this.prisma.template.count({ where: { ...where, isPeriodic: true } }),
      this.prisma.template.count({ where: { ...where, includeForm: true } }),
      this.prisma.template.groupBy({
        by: ['type'],
        where,
        _count: { type: true }
      }),
      this.prisma.emailLog.groupBy({
        by: ['status'],
        where: {
          template: { 
            ...(where.comptableId && { comptableId: where.comptableId })
          }
        },
        _count: { status: true }
      })
    ]);

    const byType = parType.reduce((acc, item) => {
      acc[item.type.toLowerCase()] = item._count.type;
      return acc;
    }, {} as Record<string, number>);

    const emailsByStatus = emailStats.reduce((acc, item) => {
      acc[item.status.toLowerCase()] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      actifs,
      periodiques,
      withForms,
      byType,
      emailStats: emailsByStatus
    };
  }

  async getCategories(userId?: number) {
    let where: any = {};

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (comptable) {
        where = { comptableId: comptable.id };
      }
    }

    const categories = await this.prisma.template.findMany({
      where,
      select: { category: true },
      distinct: ['category']
    });

    return categories.map(c => c.category).filter(Boolean);
  }

  async getAvailableClients(userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
    }

    return this.prisma.client.findMany({
      where: { comptableId: comptable.id },
      select: {
        id: true,
        raisonSociale: true,
        siret: true,
        user: {
          select: {
            email: true,
            nom: true
          }
        }
      },
      orderBy: { raisonSociale: 'asc' }
    });
  }

  async getTemplateEmailHistory(templateId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const [emails, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where: { templateId },
        include: {
          client: {
            select: {
              raisonSociale: true,
              siret: true,
              user: {
                select: { email: true }
              }
            }
          },
          dynamicFormResponses: {
            select: {
              id: true,
              status: true,
              dateCompletion: true
            }
          }
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailLog.count({
        where: { templateId }
      })
    ]);

    return {
      emails: emails.map(email => ({
        ...email,
        tracking: {
          sent: !!email.sentAt,
          opened: !!email.openedAt,
          clicked: !!email.clickedAt,
          responded: !!email.respondedAt,
          formCompleted: !!email.dynamicFormResponses?.some(r => r.dateCompletion),
        }
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    };
  }
  //get form by secure token 
  async getFormByTokenSecure(token: string, ipAddress?: string, userAgent?: string) {
    // Vérification de l'activité suspecte
    if (ipAddress) {
      const isSuspicious = await this.auditService.detectSuspiciousActivity(token, ipAddress);
      if (isSuspicious) {
        await this.auditService.logFormAccess({
          token,
          action: 'ERROR',
          ipAddress,
          userAgent,
          details: { reason: 'suspicious_activity' }
        });
        throw new BadRequestException('Activité suspecte détectée');
      }
    }

    const emailLog = await this.prisma.emailLog.findUnique({
      where: { token },
      include: {
        template: {
          include: {
            dynamicForm: true,
            comptable: {
              include: {
                user: {
                  select: { nom: true, email: true }
                }
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            raisonSociale: true,
            siret: true,
            user: { 
              select: { 
                email: true, 
                nom: true 
              } 
            }
          }
        },
        dynamicFormResponses: {
          where: { status: 'COMPLETED' },
          orderBy: { dateCompletion: 'desc' },
          take: 1
        }
      }
    });

    if (!emailLog) {
      await this.auditService.logFormAccess({
        token,
        action: 'ERROR',
        ipAddress,
        userAgent,
        details: { reason: 'token_not_found' }
      });
      throw new NotFoundException('Token invalide ou expiré');
    }

    // Vérifications de sécurité
    if (!emailLog.template.includeForm || !emailLog.template.dynamicForm) {
      throw new NotFoundException('Aucun formulaire associé à ce token');
    }

    if (!emailLog.template.dynamicForm.isActive) {
      throw new BadRequestException('Ce formulaire n\'est plus actif');
    }

    // Vérification d'expiration
    const expirationDate = new Date(emailLog.sentAt);
    expirationDate.setDate(expirationDate.getDate() + emailLog.template.dynamicForm.expirationDays);

    if (new Date() > expirationDate) {
      await this.auditService.logFormAccess({
        token,
        action: 'ERROR',
        ipAddress,
        userAgent,
        details: { reason: 'expired' }
      });
      throw new BadRequestException('Ce formulaire a expiré');
    }

    // Vérifier si déjà complété
    const existingResponse = emailLog.dynamicFormResponses[0];
    const isCompleted = !!existingResponse;

    // Log de l'accès réussi
    await this.auditService.logFormAccess({
      token,
      action: 'ACCESS',
      ipAddress,
      userAgent
    });

    // Marquer comme cliqué si pas déjà fait
    if (!emailLog.clickedAt) {
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { clickedAt: new Date() }
      });
    }

    return {
      dynamicForm: emailLog.template.dynamicForm,
      client: emailLog.client,
      emailLog,
      comptable: emailLog.template.comptable,
      isCompleted,
      expirationDate,
      existingResponse
    };
  }

  /**
   * Version améliorée de submitFormResponse avec sécurité renforcée
   */



  // New method to get form access by token
  async getFormByToken(token: string) {
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { token },
      include: {
        template: {
          include: {
            dynamicForm: true,
            comptable: {
              include: {
                user: {
                  select: { nom: true, email: true }
                }
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            raisonSociale: true,
            user: { select: { email: true, nom: true } }
          }
        }
      }
    });

    if (!emailLog) {
      throw new NotFoundException('Token invalide ou expiré');
    }

    if (!emailLog.template.includeForm || !emailLog.template.dynamicForm) {
      throw new NotFoundException('Aucun formulaire associé à ce token');
    }

    // Check if form is still active and within expiration
    const expirationDate = new Date(emailLog.sentAt);
    expirationDate.setDate(expirationDate.getDate() + emailLog.template.dynamicForm.expirationDays);

    if (new Date() > expirationDate) {
      throw new BadRequestException('Ce formulaire a expiré');
    }

    // Check if already completed
    const existingResponse = await this.prisma.dynamicFormResponse.findFirst({
      where: {
        emailLogId: emailLog.id,
        status: 'COMPLETED'
      }
    });

    // Mark as clicked if not already
    if (!emailLog.clickedAt) {
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { clickedAt: new Date() }
      });
    }

    return {
      dynamicForm: emailLog.template.dynamicForm,
      client: emailLog.client,
      emailLog,
      comptable: emailLog.template.comptable,
      isCompleted: !!existingResponse,
      expirationDate,
      existingResponse
    };
  }

  // New method to submit form response
  async submitFormResponseSecure(
    token: string, 
    responses: Record<string, any>, 
    ipAddress?: string, 
    userAgent?: string
  ) {
    try {
      // Récupérer les données du formulaire avec vérifications de sécurité
      const formData = await this.getFormByTokenSecure(token, ipAddress, userAgent);
      
      if (formData.isCompleted) {
        await this.auditService.logFormAccess({
          token,
          action: 'ERROR',
          ipAddress,
          userAgent,
          details: { reason: 'already_completed' }
        });
        throw new BadRequestException('Ce formulaire a déjà été complété');
      }

      // Validation des réponses avec les champs du formulaire
      const formFields = formData.dynamicForm.fields;
      if (formFields && Array.isArray(formFields)) {
        this.validateFormResponses(formFields as any, responses);
      }

      // Nettoyage et sanitisation des données
      const sanitizedResponses = this.sanitizeFormResponses(responses);

      const response = await this.prisma.dynamicFormResponse.create({
        data: {
          responses: sanitizedResponses as any,
          status: 'COMPLETED',
          dateCompletion: new Date(),
          dateExpiration: formData.expirationDate,
          ipAddress: ipAddress,
          userAgent: userAgent,
          clientId: formData.client.id,
          dynamicFormId: formData.dynamicForm.id,
          emailLogId: formData.emailLog.id,
        },
        include: {
          client: {
            select: {
              raisonSociale: true,
              user: { select: { email: true } }
            }
          },
          dynamicForm: {
            select: {
              title: true,
              comptable: {
                select: {
                  user: { select: { email: true, nom: true } }
                }
              }
            }
          }
        }
      });

      // Mettre à jour le statut de l'email
      await this.prisma.emailLog.update({
        where: { id: formData.emailLog.id },
        data: { 
          status: 'RESPONDED',
          respondedAt: new Date()
        }
      });

      // Créer notification pour le comptable
      await this.prisma.notification.create({
        data: {
          titre: 'Formulaire complété',
          message: `${formData.client.raisonSociale} a complété le formulaire "${formData.dynamicForm.title}"`,
          type: 'FORMULAIRE_COMPLETE',
          comptableId: formData.dynamicForm.comptableId,
        }
      });

      // Log de succès
      await this.auditService.logFormAccess({
        token,
        action: 'SUBMIT',
        ipAddress,
        userAgent,
        details: { 
          responseId: response.id,
          clientId: formData.client.id,
          formId: formData.dynamicForm.id
        }
      });

      this.logger.log(`Form response submitted successfully: ${response.id} by client ${formData.client.id}`);
      
      return response;

    } catch (error) {
      // Log des erreurs
      await this.auditService.logFormAccess({
        token,
        action: 'ERROR',
        ipAddress,
        userAgent,
        details: { 
          error: error.message,
          type: 'submission_error'
        }
      });
      throw error;
    }
  }

  /**
   * Sanitise les réponses du formulaire pour éviter les injections
   */

  private sanitizeFormResponses(responses: Record<string, any>): Record<string, any> {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(responses)) {
      if (typeof value === 'string') {
        // Échapper les caractères HTML dangereux
        sanitized[key] = value
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;')
          .trim()
          .substring(0, 10000); // Limite de 10k caractères par champ
      } else if (Array.isArray(value)) {
        // Pour les checkboxes
        sanitized[key] = value
          .filter(v => typeof v === 'string')
          .map(v => v.toString().trim().substring(0, 1000))
          .slice(0, 50); // Max 50 éléments
      } else if (typeof value === 'number') {
        sanitized[key] = Number(value);
      } else if (typeof value === 'boolean') {
        sanitized[key] = Boolean(value);
      } else {
        // Convertir en string sécurisé pour les autres types
        sanitized[key] = String(value).trim().substring(0, 1000);
      }
    }
    
    return sanitized;
  }

  /**
   * Génère un lien de formulaire sécurisé avec expiration
   */
  async generateSecureFormLink(emailLogId: number): Promise<string> {
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { id: emailLogId },
      include: {
        template: {
          include: {
            dynamicForm: true
          }
        }
      }
    });

    if (!emailLog || !emailLog.template.includeForm) {
      throw new BadRequestException('Aucun formulaire associé');
    }

    const frontendUrl = this.configService.get('FRONTEND_URL');
    return `${frontendUrl}/client-portal/${emailLog.token}`;
  }

  /**
   * Invalide un token (pour sécurité supplémentaire)
   */
  async invalidateFormToken(token: string, reason: string) {
    await this.prisma.emailLog.update({
      where: { token },
      data: {
        status: 'FAILED',
        error: `Token invalidé: ${reason}`
      }
    });

    this.logger.warn(`Token invalidated: ${token}, reason: ${reason}`);
  }


  // Helper method to validate form fields structure
  private validateFormFields(fields: DynamicFormFieldDto[]) {
    if (!fields || fields.length === 0) {
      throw new BadRequestException('Au moins un champ est requis');
    }

    const labels = new Set();
    
    for (const field of fields) {
      // Check for duplicate labels
      if (labels.has(field.label)) {
        throw new BadRequestException(`Le libellé "${field.label}" est utilisé plusieurs fois`);
      }
      labels.add(field.label);

      // Validate required options for select/radio/checkbox
      if (['select', 'radio', 'checkbox'].includes(field.type)) {
        if (!field.options || field.options.length === 0) {
          throw new BadRequestException(`Le champ "${field.label}" de type ${field.type} nécessite au moins une option`);
        }
      }

      // Validate field validation rules
      if (field.validation) {
        if (field.validation.minLength && field.validation.maxLength && 
            field.validation.minLength > field.validation.maxLength) {
          throw new BadRequestException(`Validation invalide pour "${field.label}": minLength ne peut pas être supérieur à maxLength`);
        }
      }
    }
  }

  // Helper method to validate form responses
  private validateFormResponses(fields: DynamicFormFieldDto[], responses: Record<string, any>) {
    for (const field of fields) {
      const response = responses[field.label];

      // Check required fields
      if (field.required && (!response || response === '')) {
        throw new BadRequestException(`Le champ "${field.label}" est obligatoire`);
      }

      if (response && response !== '') {
        // Validate field types
        switch (field.type) {
          case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(response)) {
              throw new BadRequestException(`Format email invalide pour "${field.label}"`);
            }
            break;

          case 'tel':
            const phoneRegex = /^[\d\s\-\+\(\)\.]+$/;
            if (!phoneRegex.test(response)) {
              throw new BadRequestException(`Format téléphone invalide pour "${field.label}"`);
            }
            break;

          case 'number':
            if (isNaN(Number(response))) {
              throw new BadRequestException(`"${field.label}" doit être un nombre`);
            }
            break;

          case 'date':
            if (isNaN(Date.parse(response))) {
              throw new BadRequestException(`Format date invalide pour "${field.label}"`);
            }
            break;

          case 'select':
          case 'radio':
            if (!field.options?.includes(response)) {
              throw new BadRequestException(`Option invalide pour "${field.label}"`);
            }
            break;

          case 'checkbox':
            if (!Array.isArray(response)) {
              throw new BadRequestException(`"${field.label}" doit être un tableau d'options`);
            }
            const invalidOptions = response.filter(option => !field.options?.includes(option));
            if (invalidOptions.length > 0) {
              throw new BadRequestException(`Options invalides pour "${field.label}": ${invalidOptions.join(', ')}`);
            }
            break;
        }

        // Apply validation rules
        if (field.validation) {
          const validation = field.validation;
          
          if (typeof response === 'string') {
            if (validation.minLength && response.length < validation.minLength) {
              throw new BadRequestException(`"${field.label}" doit contenir au moins ${validation.minLength} caractères`);
            }
            
            if (validation.maxLength && response.length > validation.maxLength) {
              throw new BadRequestException(`"${field.label}" ne peut pas dépasser ${validation.maxLength} caractères`);
            }
            
            if (validation.pattern) {
              const regex = new RegExp(validation.pattern);
              if (!regex.test(response)) {
                const message = validation.patternMessage || `Format invalide pour "${field.label}"`;
                throw new BadRequestException(message);
              }
            }
          }
          
          if (field.type === 'number') {
            const numValue = Number(response);
            if (validation.min !== undefined && numValue < validation.min) {
              throw new BadRequestException(`"${field.label}" doit être supérieur ou égal à ${validation.min}`);
            }
            if (validation.max !== undefined && numValue > validation.max) {
              throw new BadRequestException(`"${field.label}" doit être inférieur ou égal à ${validation.max}`);
            }
          }
        }
      }
    }
  }

  private extractVariables(text: string): string[] {
    const variableRegex = /{([^}]+)}/g;
    const variables: string[] = [];
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      variables.push(match[1].trim());
    }

    return [...new Set(variables)];
  }


}