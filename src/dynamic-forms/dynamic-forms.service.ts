// src/dynamic-forms/dynamic-forms.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { 
  CreateDynamicFormDto, 
  UpdateDynamicFormDto, 
  SubmitDynamicFormDto,
  DynamicFormFieldDto 
} from './dto/dynamic-form.dto';
import { Prisma } from '@prisma/client';

import { FormSubmissionDto } from './interfaces/form-submission.interface';
import { TemplateEmailsService } from 'src/template-emails/services/template-emails.service';


@Injectable()
export class DynamicFormsService {
  private readonly logger = new Logger(DynamicFormsService.name);

  constructor(private readonly prisma: PrismaService,private readonly templateEmailsService: TemplateEmailsService) {}

  async create(createDynamicFormDto: CreateDynamicFormDto, userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé pour cet utilisateur');
    }

    // Validate field structure
    this.validateFormFields(createDynamicFormDto.fields);

    const dynamicForm = await this.prisma.dynamicForm.create({
      data: {
        title: createDynamicFormDto.title,
        description: createDynamicFormDto.description,
        fields: createDynamicFormDto.fields as unknown as Prisma.InputJsonValue,
        expirationDays: createDynamicFormDto.expirationDays || 30,
        requiresAuthentication: createDynamicFormDto.requiresAuthentication ?? true,
        isActive: createDynamicFormDto.isActive ?? true,
        comptableId: comptable.id,
      },
      include: {
        comptable: {
          include: {
            user: {
              select: { nom: true, email: true }
            }
          }
        }
      }
    });

    this.logger.log(`Dynamic form created: ${dynamicForm.id} by comptable ${comptable.id}`);
    return dynamicForm;
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

    return this.prisma.dynamicForm.findMany({
      where,
      include: {
        comptable: {
          include: {
            user: {
              select: { nom: true, email: true }
            }
          }
        },
        _count: {
          select: {
            responses: true,
            templates: true
          }
        }
      },
      orderBy: { dateCreation: 'desc' }
    });
  }

  async findOne(id: number, userId?: number) {
    const dynamicForm = await this.prisma.dynamicForm.findUnique({
      where: { id },
      include: {
        comptable: {
          include: {
            user: {
              select: { nom: true, email: true }
            }
          }
        },
        responses: {
          include: {
            client: {
              select: {
                raisonSociale: true,
                user: { select: { email: true } }
              }
            }
          },
          orderBy: { dateCreation: 'desc' }
        },
        templates: {
          select: {
            id: true,
            nom: true,
            actif: true
          }
        }
      }
    });

    if (!dynamicForm) {
      throw new NotFoundException('Formulaire dynamique non trouvé');
    }

    if (userId) {
      const comptable = await this.prisma.comptable.findUnique({
        where: { userId }
      });

      if (!comptable || dynamicForm.comptableId !== comptable.id) {
        throw new BadRequestException('Vous n\'avez pas accès à ce formulaire');
      }
    }

    return dynamicForm;
  }

  async findByToken(token: string) {
    // Find the email log with this token
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { token },
      include: {
        template: {
          include: {
            dynamicForm: true
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

    if (!emailLog.template.dynamicForm) {
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

    return {
      dynamicForm: emailLog.template.dynamicForm,
      client: emailLog.client,
      emailLog,
      isCompleted: !!existingResponse,
      expirationDate
    };
  }

  async update(id: number, updateDynamicFormDto: UpdateDynamicFormDto, userId: number) {
    const currentForm = await this.findOne(id, userId);

    if (updateDynamicFormDto.fields) {
      this.validateFormFields(updateDynamicFormDto.fields);
    }

    // Destructure to separate fields from other properties
    const { fields, ...otherUpdateData } = updateDynamicFormDto;

    const updateData: Prisma.DynamicFormUpdateInput = {
      ...otherUpdateData,
      dateModification: new Date(),
    };

    // Convert fields to JSON if provided
    if (fields) {
      updateData.fields = fields as unknown as Prisma.InputJsonValue;
    }

    return this.prisma.dynamicForm.update({
      where: { id },
      data: updateData,
      include: {
        comptable: {
          include: {
            user: {
              select: { nom: true, email: true }
            }
          }
        }
      }
    });
  }

  async remove(id: number, userId: number) {
    const dynamicForm = await this.findOne(id, userId);

    // Check if form is being used by any active templates
    const activeTemplates = await this.prisma.template.count({
      where: { 
        dynamicFormId: id,
        actif: true 
      }
    });

    if (activeTemplates > 0) {
      throw new BadRequestException(
        `Ce formulaire est utilisé par ${activeTemplates} template(s) actif(s). Désactivez d'abord les templates associés.`
      );
    }

    return this.prisma.dynamicForm.delete({
      where: { id }
    });
  }

  async submitForm(submitDto: SubmitDynamicFormDto) {
    const formData = await this.findByToken(submitDto.token);
    
    if (formData.isCompleted) {
      throw new BadRequestException('Ce formulaire a déjà été complété');
    }

    // Validate responses against form fields
    this.validateFormResponses(formData.dynamicForm.fields as unknown as DynamicFormFieldDto[], submitDto.responses);

    // Calculate expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + formData.dynamicForm.expirationDays);

    const response = await this.prisma.dynamicFormResponse.create({
      data: {
        responses: submitDto.responses as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        dateCompletion: new Date(),
        dateExpiration: expirationDate,
        ipAddress: submitDto.ipAddress,
        userAgent: submitDto.userAgent,
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

    // Update email log status
    await this.prisma.emailLog.update({
      where: { id: formData.emailLog.id },
      data: { 
        status: 'RESPONDED',
        respondedAt: new Date()
      }
    });

    // Create notification for comptable
    await this.prisma.notification.create({
      data: {
        titre: 'Formulaire complété',
        message: `${formData.client.raisonSociale} a complété le formulaire "${formData.dynamicForm.title}"`,
        type: 'FORMULAIRE_COMPLETE',
        comptableId: formData.dynamicForm.comptableId,
      }
    });

    this.logger.log(`Form response submitted: ${response.id} by client ${formData.client.id}`);
    return response;
  }

  async getFormResponses(formId: number, userId: number, page = 1, limit = 10) {
    await this.findOne(formId, userId); // Validates access

    const skip = (page - 1) * limit;

    const [responses, total] = await Promise.all([
      this.prisma.dynamicFormResponse.findMany({
        where: { dynamicFormId: formId },
        include: {
          client: {
            select: {
              raisonSociale: true,
              user: { select: { email: true } }
            }
          }
        },
        orderBy: { dateCreation: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.dynamicFormResponse.count({
        where: { dynamicFormId: formId }
      })
    ]);

    return {
      responses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    };
  }

  async exportFormResponses(formId: number, userId: number) {
    const form = await this.findOne(formId, userId);
    
    const responses = await this.prisma.dynamicFormResponse.findMany({
      where: { dynamicFormId: formId },
      include: {
        client: {
          select: {
            raisonSociale: true,
            siret: true,
            user: { select: { email: true } }
          }
        }
      },
      orderBy: { dateCreation: 'desc' }
    });

    // Convert to CSV-like format
    const fields = form.fields as unknown as DynamicFormFieldDto[];
    const headers = [
      'ID Réponse',
      'Client',
      'SIRET',
      'Email',
      'Date Création',
      'Date Completion',
      'Statut',
      ...fields.map(field => field.label)
    ];

    const data = responses.map(response => [
      response.id,
      response.client.raisonSociale,
      response.client.siret,
      response.client.user.email,
      response.dateCreation.toISOString(),
      response.dateCompletion?.toISOString() || '',
      response.status,
      ...fields.map(field => {
        const responseData = response.responses as Record<string, any>;
        const fieldResponse = responseData[field.label] || '';
        return Array.isArray(fieldResponse) ? fieldResponse.join(', ') : fieldResponse;
      })
    ]);

    return {
      headers,
      data,
      filename: `${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses_${new Date().toISOString().split('T')[0]}.csv`
    };
  }

  async getFormStats(formId: number, userId: number) {
    await this.findOne(formId, userId); // Validates access

    const [total, byStatus, recentResponses] = await Promise.all([
      this.prisma.dynamicFormResponse.count({
        where: { dynamicFormId: formId }
      }),
      this.prisma.dynamicFormResponse.groupBy({
        by: ['status'],
        where: { dynamicFormId: formId },
        _count: { status: true }
      }),
      this.prisma.dynamicFormResponse.findMany({
        where: { dynamicFormId: formId },
        include: {
          client: {
            select: {
              raisonSociale: true
            }
          }
        },
        orderBy: { dateCreation: 'desc' },
        take: 5
      })
    ]);

    const statusStats = byStatus.reduce((acc, item) => {
      acc[item.status.toLowerCase()] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      statusStats,
      recentResponses: recentResponses.map(response => ({
        id: response.id,
        clientName: response.client.raisonSociale,
        status: response.status,
        dateCreation: response.dateCreation,
        dateCompletion: response.dateCompletion
      }))
    };
  }

  async toggleStatus(id: number, userId: number) {
    const form = await this.findOne(id, userId);
    
    return this.prisma.dynamicForm.update({
      where: { id },
      data: {
        isActive: !form.isActive,
        dateModification: new Date()
      }
    });
  }

  async duplicate(id: number, newTitle: string, userId: number) {
    const originalForm = await this.findOne(id, userId);

    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    return this.prisma.dynamicForm.create({
      data: {
        title: newTitle || `${originalForm.title} (Copie)`,
        description: originalForm.description,
        fields: originalForm.fields as unknown as Prisma.InputJsonValue,
        expirationDays: originalForm.expirationDays,
        requiresAuthentication: originalForm.requiresAuthentication,
        isActive: false, // Start as inactive for safety
        comptableId: comptable.id,
      },
      include: {
        comptable: {
          include: {
            user: {
              select: { nom: true, email: true }
            }
          }
        }
      }
    });
  }

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

  async getResponseById(responseId: number, userId: number) {
    const response = await this.prisma.dynamicFormResponse.findUnique({
      where: { id: responseId },
      include: {
        client: {
          select: {
            raisonSociale: true,
            siret: true,
            user: { select: { email: true, nom: true } }
          }
        },
        dynamicForm: {
          include: {
            comptable: true
          }
        },
        emailLog: {
          select: {
            token: true,
            sentAt: true,
            openedAt: true,
            clickedAt: true
          }
        }
      }
    });

    if (!response) {
      throw new NotFoundException('Réponse non trouvée');
    }

    // Verify access
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable || response.dynamicForm.comptableId !== comptable.id) {
      throw new BadRequestException('Vous n\'avez pas accès à cette réponse');
    }

    return response;
  }

  async deleteResponse(responseId: number, userId: number) {
    const response = await this.getResponseById(responseId, userId);
    
    return this.prisma.dynamicFormResponse.delete({
      where: { id: responseId }
    });
  }

  async getFormAnalytics(formId: number, userId: number) {
    const form = await this.findOne(formId, userId);
    
    const fields = form.fields as unknown as DynamicFormFieldDto[];
    const analytics = {
      overview: {
        totalResponses: 0,
        completedResponses: 0,
        pendingResponses: 0,
        completionRate: 0,
        averageCompletionTime: 0
      },
      fieldAnalytics: [] as any[]
    };

    // Get overview stats
    const [responseStats, completionTimes, totalResponsesCount] = await Promise.all([
      this.prisma.dynamicFormResponse.groupBy({
        by: ['status'],
        where: { dynamicFormId: formId },
        _count: { status: true }
      }),
      this.prisma.dynamicFormResponse.findMany({
        where: { 
          dynamicFormId: formId,
          status: 'COMPLETED',
          dateCompletion: { not: null }
        },
        select: {
          dateCreation: true,
          dateCompletion: true
        }
      }),
      this.prisma.dynamicFormResponse.count({
        where: { dynamicFormId: formId }
      })
    ]);

    analytics.overview.totalResponses = totalResponsesCount;
    analytics.overview.completedResponses = responseStats.find(s => s.status === 'COMPLETED')?._count.status || 0;
    analytics.overview.pendingResponses = responseStats.find(s => s.status === 'PENDING')?._count.status || 0;
    analytics.overview.completionRate = analytics.overview.totalResponses > 0 
      ? (analytics.overview.completedResponses / analytics.overview.totalResponses) * 100 
      : 0;

    // Calculate average completion time
    if (completionTimes.length > 0) {
      const totalTime = completionTimes.reduce((sum, response) => {
        const timeDiff = new Date(response.dateCompletion!).getTime() - new Date(response.dateCreation).getTime();
        return sum + timeDiff;
      }, 0);
      analytics.overview.averageCompletionTime = totalTime / completionTimes.length / (1000 * 60); // in minutes
    }

    // Get all responses for field analysis
    const allResponses = await this.prisma.dynamicFormResponse.findMany({
      where: { 
        dynamicFormId: formId,
        status: 'COMPLETED'
      },
      select: { responses: true }
    });

    // Analyze each field
    for (const field of fields) {
      const fieldResponses = allResponses
        .map(r => {
          const responseData = r.responses as Record<string, any>;
          return responseData[field.label];
        })
        .filter(response => response !== undefined && response !== null && response !== '');

      const fieldAnalytic = {
        label: field.label,
        type: field.type,
        totalResponses: fieldResponses.length,
        responseRate: allResponses.length > 0 ? (fieldResponses.length / allResponses.length) * 100 : 0,
        data: this.analyzeFieldData(field, fieldResponses)
      };

      analytics.fieldAnalytics.push(fieldAnalytic);
    }

    return analytics;
  }

  private analyzeFieldData(field: DynamicFormFieldDto, responses: any[]) {
    switch (field.type) {
      case 'select':
      case 'radio':
        // Count occurrences of each option
        const optionCounts = {};
        responses.forEach(response => {
          optionCounts[response] = (optionCounts[response] || 0) + 1;
        });
        return { optionCounts };

      case 'checkbox':
        // Count occurrences of each option across all responses
        const checkboxCounts = {};
        responses.forEach(responseArray => {
          if (Array.isArray(responseArray)) {
            responseArray.forEach(option => {
              checkboxCounts[option] = (checkboxCounts[option] || 0) + 1;
            });
          }
        });
        return { optionCounts: checkboxCounts };

      case 'number':
        if (responses.length === 0) return {};
        const numbers = responses.map(r => Number(r)).filter(n => !isNaN(n));
        return {
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          average: numbers.reduce((a, b) => a + b, 0) / numbers.length,
          total: numbers.reduce((a, b) => a + b, 0)
        };

      case 'text':
      case 'textarea':
      case 'email':
      case 'tel':
        const lengths = responses.map(r => r.toString().length);
        return {
          averageLength: lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
          minLength: lengths.length > 0 ? Math.min(...lengths) : 0,
          maxLength: lengths.length > 0 ? Math.max(...lengths) : 0
        };

      case 'date':
        const dates = responses.map(r => new Date(r)).filter(d => !isNaN(d.getTime()));
        if (dates.length === 0) return {};
        return {
          earliest: new Date(Math.min(...dates.map(d => d.getTime()))),
          latest: new Date(Math.max(...dates.map(d => d.getTime())))
        };

      default:
        return {};
    }
  }

  async getFormByToken(token: string){
    try {
          const formData = await this.templateEmailsService.getFormByTokenSecure(token);
          
          // Ne retourner que les données nécessaires au client
          return {
            success: true,
            data: {
              dynamicForm: {
                id: formData.dynamicForm.id,
                title: formData.dynamicForm.title,
                description: formData.dynamicForm.description,
                fields: formData.dynamicForm.fields,
                expirationDays: formData.dynamicForm.expirationDays,
              },
              client: {
                id: formData.client.id,
                raisonSociale: formData.client.raisonSociale,
                user: {
                  email: formData.client.user.email,
                  nom: formData.client.user.nom,
                }
              },
              comptable: {
                user: {
                  nom: formData.comptable.user.nom,
                  email: formData.comptable.user.email,
                }
              },
              expirationDate: formData.expirationDate,
              isCompleted: formData.isCompleted,
              // Données existantes si déjà complété
              existingResponse: formData.existingResponse ? {
                id: formData.existingResponse.id,
                responses: formData.existingResponse.responses,
                dateCompletion: formData.existingResponse.dateCompletion,
              } : null
            }
          };
        } catch (error) {
          if (error instanceof NotFoundException || error instanceof BadRequestException) {
            throw error;
          }
          throw new BadRequestException('Erreur lors de la récupération du formulaire');
        }
  }

// Dans dynamic-forms.service.ts

async handleSubmitForm(
  token: string,
  submitData: FormSubmissionDto,
  clientIp: string,
  userAgent: string,
) {
  try {
    // Validation supplémentaire côté serveur
    if (!submitData.responses || Object.keys(submitData.responses).length === 0) {
      throw new BadRequestException('Aucune donnée de formulaire fournie');
    }

    // Limite de taille des réponses (sécurité)
    const responseSize = JSON.stringify(submitData.responses).length;
    if (responseSize > 100000) { // 100KB max
      throw new BadRequestException('Données de formulaire trop volumineuses');
    }

    // Traiter les informations des fichiers si présents
    const fileMetadata: Record<string, any[]> = {};
    if (submitData.files) {
      Object.keys(submitData.files).forEach(fieldLabel => {
        fileMetadata[fieldLabel] = submitData.files![fieldLabel].map(file => ({
          originalName: file.originalname,
          filename: file.filename,
          path: file.path,
          mimetype: file.mimetype,
          size: file.size,
        }));
      });
    }

    // Combiner les réponses avec les métadonnées des fichiers
    const completeResponses = {
      ...submitData.responses,
      ...(Object.keys(fileMetadata).length > 0 && { _uploadedFiles: fileMetadata }),
    };

    // Utiliser submitData.ipAddress et submitData.userAgent s'ils existent
    const result = await this.templateEmailsService.submitFormResponseSecure(
      token,
      completeResponses,
      submitData.ipAddress || clientIp,
      submitData.userAgent || userAgent
    );

    return {
      success: true,
      message: 'Formulaire soumis avec succès',
      data: {
        responseId: result.id,
        dateCompletion: result.dateCompletion,
        client: result.client.raisonSociale,
        ...(Object.keys(fileMetadata).length > 0 && { 
          filesUploaded: fileMetadata,
          totalFiles: Object.values(fileMetadata).reduce((sum, files) => sum + files.length, 0)
        }),
      },
    };
  } catch (error) {
    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }
    this.logger.error('Error submitting form:', error);
    throw new BadRequestException('Erreur lors de la soumission du formulaire');
  }
}

  async handleGetFormStatus(token: string){
    try {
      const formData = await this.templateEmailsService.getFormByTokenSecure(token);
      
      return {
        success: true,
        data: {
          isCompleted: formData.isCompleted,
          expirationDate: formData.expirationDate,
          isExpired: new Date() > formData.expirationDate,
          title: formData.dynamicForm.title,
        }
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erreur lors de la vérification du statut');
    }
  }



}