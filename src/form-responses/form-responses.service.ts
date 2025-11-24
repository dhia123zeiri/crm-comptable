// src/dynamic-forms/services/form-responses.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class FormResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all responses for a comptable with pagination and filters
   */
  async getResponses(
    userId: number,
    page = 1,
    limit = 20,
    filters?: {
      formId?: number;
      clientId?: number;
      isRead?: boolean;
      status?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ) {
    // Get comptable
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      dynamicForm: {
        comptableId: comptable.id
      }
    };

    if (filters?.formId) {
      where.dynamicFormId = filters.formId;
    }

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters?.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.dateCreation = {};
      if (filters.dateFrom) {
        where.dateCreation.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.dateCreation.lte = filters.dateTo;
      }
    }

    // Get responses with pagination
    const [responses, total, unreadCount] = await Promise.all([
      this.prisma.dynamicFormResponse.findMany({
        where,
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
          },
          dynamicForm: {
            select: {
              id: true,
              title: true,
              description: true,
              fields: true
            }
          },
          emailLog: {
            select: {
              sentAt: true,
              openedAt: true,
              clickedAt: true
            }
          }
        },
        orderBy: [
          { isRead: 'asc' },  // Unread first
          { dateCompletion: 'desc' }
        ],
        skip,
        take: limit
      }),
      this.prisma.dynamicFormResponse.count({ where }),
      this.prisma.dynamicFormResponse.count({
        where: {
          ...where,
          isRead: false
        }
      })
    ]);

    return {
      responses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        unreadCount
      }
    };
  }

  /**
   * Get a single response by ID
   */
  async getResponseById(responseId: number, userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    const response = await this.prisma.dynamicFormResponse.findUnique({
      where: { id: responseId },
      include: {
        client: {
          select: {
            id: true,
            raisonSociale: true,
            siret: true,
            telephone: true,
            adresse: true,
            codePostal: true,
            ville: true,
            user: {
              select: {
                email: true,
                nom: true
              }
            }
          }
        },
        dynamicForm: {
          include: {
            comptable: {
              select: {
                id: true
              }
            }
          }
        },
        emailLog: {
          select: {
            sentAt: true,
            openedAt: true,
            clickedAt: true,
            respondedAt: true
          }
        }
      }
    });

    if (!response) {
      throw new NotFoundException('Réponse non trouvée');
    }

    // Verify access
    if (response.dynamicForm.comptable.id !== comptable.id) {
      throw new BadRequestException('Vous n\'avez pas accès à cette réponse');
    }

    return response;
  }

  /**
   * Mark a response as read
   */
  async markAsRead(responseId: number, userId: number) {
    // Verify access
    await this.getResponseById(responseId, userId);

    const response = await this.prisma.dynamicFormResponse.update({
      where: { id: responseId },
      data: {
        isRead: true,
        dateRead: new Date()
      }
    });

    return response;
  }

  /**
   * Mark multiple responses as read
   */
  async markMultipleAsRead(responseIds: number[], userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    // Verify all responses belong to comptable
    const responses = await this.prisma.dynamicFormResponse.findMany({
      where: {
        id: { in: responseIds },
        dynamicForm: {
          comptableId: comptable.id
        }
      }
    });

    if (responses.length !== responseIds.length) {
      throw new BadRequestException('Certaines réponses sont invalides');
    }

    // Update all at once
    await this.prisma.dynamicFormResponse.updateMany({
      where: {
        id: { in: responseIds }
      },
      data: {
        isRead: true,
        dateRead: new Date()
      }
    });

    return { updated: responseIds.length };
  }

  /**
   * Mark a response as unread
   */
  async markAsUnread(responseId: number, userId: number) {
    // Verify access
    await this.getResponseById(responseId, userId);

    const response = await this.prisma.dynamicFormResponse.update({
      where: { id: responseId },
      data: {
        isRead: false,
        dateRead: null
      }
    });

    return response;
  }

  /**
   * Get response statistics
   */
  async getResponseStats(userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    const [
      totalResponses,
      unreadCount,
      completedToday,
      responsesByForm,
      recentResponses
    ] = await Promise.all([
      // Total responses
      this.prisma.dynamicFormResponse.count({
        where: {
          dynamicForm: {
            comptableId: comptable.id
          }
        }
      }),
      // Unread count
      this.prisma.dynamicFormResponse.count({
        where: {
          dynamicForm: {
            comptableId: comptable.id
          },
          isRead: false
        }
      }),
      // Completed today
      this.prisma.dynamicFormResponse.count({
        where: {
          dynamicForm: {
            comptableId: comptable.id
          },
          dateCompletion: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      // Responses by form
      this.prisma.dynamicFormResponse.groupBy({
        by: ['dynamicFormId'],
        where: {
          dynamicForm: {
            comptableId: comptable.id
          }
        },
        _count: {
          id: true
        }
      }),
      // Recent unread responses (last 5)
      this.prisma.dynamicFormResponse.findMany({
        where: {
          dynamicForm: {
            comptableId: comptable.id
          },
          isRead: false
        },
        include: {
          client: {
            select: {
              raisonSociale: true
            }
          },
          dynamicForm: {
            select: {
              title: true
            }
          }
        },
        orderBy: {
          dateCompletion: 'desc'
        },
        take: 5
      })
    ]);

    return {
      totalResponses,
      unreadCount,
      readCount: totalResponses - unreadCount,
      completedToday,
      responsesByForm,
      recentUnread: recentResponses
    };
  }

  /**
   * Delete a response
   */
  async deleteResponse(responseId: number, userId: number) {
    // Verify access
    await this.getResponseById(responseId, userId);

    await this.prisma.dynamicFormResponse.delete({
      where: { id: responseId }
    });

    return { success: true, message: 'Réponse supprimée avec succès' };
  }
}