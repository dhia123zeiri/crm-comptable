import { Injectable, Logger, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientDashboardStats } from './interface/clientDashboardStats.interface';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private prisma: PrismaService) {}

  // Helper method to get comptableId from userId
  private async getComptableId(userId: number): Promise<number> {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable introuvable');
    }

    return comptable.id;
  }

  async create(createClientDto: CreateClientDto, userId: number) {
    const { email, password, siret, ...clientData } = createClientDto;

    // Get comptableId from userId
    const comptableId = await this.getComptableId(userId);

    this.logger.log(`Creating client for comptable ${comptableId} (user ${userId})`);

    // Vérifications d'unicité en parallèle
    const [existingSiret, existingUser] = await Promise.all([
      this.prisma.client.findUnique({
        where: { siret }
      }),
      this.prisma.user.findUnique({
        where: { email }
      })
    ]);

    if (existingSiret) {
      throw new ConflictException('Un client avec ce SIRET existe déjà');
    }

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Créer l'utilisateur et le client en transaction
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Créer l'utilisateur
        const user = await tx.user.create({
          data: {
            nom: clientData.raisonSociale,
            email,
            password: hashedPassword,
            role: Role.CLIENT,
          }
        });

        // Créer le client
        const client = await tx.client.create({
          data: {
            userId: user.id,
            siret,
            comptableId,
            ...clientData,
          },
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                email: true,
                role: true,
                dateCreation: true,
                actif: true,
              }
            },
            comptable: {
              include: {
                user: {
                  select: {
                    nom: true,
                    email: true,
                  }
                }
              }
            }
          }
        });

        return client;
      });

      this.logger.log(`Client created successfully: ${result.id}`);
      return result;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Violation de contrainte d\'unicité');
      }
      throw new BadRequestException('Erreur lors de la création du client');
    }
  }

  async findAllByComptable(userId: number) {
    // Get comptableId from userId
    const comptableId = await this.getComptableId(userId);

    this.logger.log(`Fetching clients for comptable ${comptableId} (user ${userId})`);

    return this.prisma.client.findMany({
      where: { 
        comptableId,
        user: {
          actif: true
        }
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            email: true,
            dateCreation: true,
            actif: true,
          }
        }
      },
      orderBy: {
        user: {
          dateCreation: 'desc'
        }
      }
    });
  }

  async findOne(id: number, userId: number) {
    // Get comptableId from userId
    const comptableId = await this.getComptableId(userId);

    this.logger.log(`Fetching client ${id} for comptable ${comptableId} (user ${userId})`);

    const client = await this.prisma.client.findFirst({
      where: {
        id,
        comptableId
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            email: true,
            dateCreation: true,
            dateModification: true,
            actif: true,
          }
        },
        comptable: {
          include: {
            user: {
              select: {
                nom: true,
                email: true,
              }
            }
          }
        }
      }
    });

    if (!client) {
      this.logger.error(`Client ${id} not found for comptable ${comptableId}`);
      throw new NotFoundException('Client introuvable');
    }

    return client;
  }

  async verifyToken(token: string) {
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { token },
      include: {
        client: {
          include: {
            user: {
              select: {
                nom: true,
                email: true
              }
            },
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
        },
        template: {
          select: {
            nom: true,
            subject: true,
            type: true
          }
        }
      }
    });

    if (!emailLog) {
      throw new NotFoundException('Token invalide ou expiré');
    }

    if (!emailLog.clickedAt) {
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { clickedAt: new Date() }
      });
    }

    return {
      emailLog,
      client: emailLog.client,
      template: emailLog.template,
      comptable: emailLog.client.comptable
    };
  }

  async saveFormulaireResponse(token: string, reponses: any, status: 'STARTED' | 'COMPLETED' = 'STARTED') {
    const tokenData = await this.verifyToken(token);
    
    const formulaire = await this.prisma.formulaire.findFirst({
      where: {
        clientId: tokenData.client.id,
        emailLogId: tokenData.emailLog.id
      }
    });

    if (!formulaire) {
      throw new NotFoundException('Formulaire non trouvé');
    }

    if (formulaire.status === 'EXPIRED' || formulaire.status === 'CANCELLED') {
      throw new BadRequestException('Ce formulaire n\'est plus disponible');
    }

    if (formulaire.dateExpiration && new Date() > formulaire.dateExpiration) {
      await this.prisma.formulaire.update({
        where: { id: formulaire.id },
        data: { status: 'EXPIRED' }
      });
      throw new BadRequestException('Ce formulaire a expiré');
    }

    const updateData: any = {
      reponses,
      status,
      dateModification: new Date()
    };

    if (status === 'COMPLETED') {
      updateData.dateCompletion = new Date();
      
      await this.prisma.emailLog.update({
        where: { id: tokenData.emailLog.id },
        data: { respondedAt: new Date() }
      });
    }

    const updatedFormulaire = await this.prisma.formulaire.update({
      where: { id: formulaire.id },
      data: updateData,
      include: {
        documents: true
      }
    });

    this.logger.log(`Formulaire ${formulaire.id} mis à jour avec statut ${status} pour client ${tokenData.client.id}`);

    return updatedFormulaire;
  }

  async update(id: number, updateClientDto: UpdateClientDto, userId: number) {
    const { email, password, siret, raisonSociale, ...clientData } = updateClientDto;

    // Get comptableId from userId
    const comptableId = await this.getComptableId(userId);

    this.logger.log(`Updating client ${id} for comptable ${comptableId} (user ${userId})`);

    // Vérifier que le client existe et appartient au comptable
    const existingClient = await this.prisma.client.findFirst({
      where: {
        id,
        comptableId
      },
      include: {
        user: true
      }
    });

    if (!existingClient) {
      this.logger.error(`Client ${id} not found for comptable ${comptableId}`);
      
      // Debug: Check if client exists at all
      const anyClient = await this.prisma.client.findUnique({ 
        where: { id },
        select: { id: true, comptableId: true, raisonSociale: true }
      });
      
      if (!anyClient) {
        this.logger.error(`Client ${id} does not exist in database`);
      } else {
        this.logger.error(`Client ${id} exists but belongs to comptable ${anyClient.comptableId}, not ${comptableId}`);
      }
      
      throw new NotFoundException('Client introuvable');
    }

    this.logger.log(`Found client: ${existingClient.raisonSociale}`);

    // Vérifications d'unicité si les champs sont modifiés
    const checks: Promise<void>[] = [];

    if (siret && siret !== existingClient.siret) {
      checks.push(
        this.prisma.client.findFirst({
          where: {
            siret,
            id: { not: id }
          }
        }).then(result => {
          if (result) {
            throw new ConflictException('Un client avec ce SIRET existe déjà');
          }
        })
      );
    }

    if (email && email !== existingClient.user.email) {
      checks.push(
        this.prisma.user.findFirst({
          where: {
            email,
            id: { not: existingClient.userId }
          }
        }).then(result => {
          if (result) {
            throw new ConflictException('Un utilisateur avec cet email existe déjà');
          }
        })
      );
    }

    if (checks.length > 0) {
      await Promise.all(checks);
    }

    // Préparer les données de mise à jour
    const userUpdateData: Partial<{ email: string; nom: string; password: string }> = {};
    if (email) userUpdateData.email = email;
    if (raisonSociale) userUpdateData.nom = raisonSociale;
    if (password) {
      userUpdateData.password = await bcrypt.hash(password, 12);
    }

    const clientUpdateData: Partial<typeof clientData & { siret?: string; raisonSociale?: string }> = { ...clientData };
    if (siret) clientUpdateData.siret = siret;
    if (raisonSociale) clientUpdateData.raisonSociale = raisonSociale;

    // Mettre à jour en transaction
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Mettre à jour l'utilisateur si nécessaire
        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { id: existingClient.userId },
            data: {
              ...userUpdateData,
              dateModification: new Date()
            }
          });
        }

        // Mettre à jour le client si nécessaire
        if (Object.keys(clientUpdateData).length > 0) {
          const updatedClient = await tx.client.update({
            where: { id },
            data: clientUpdateData,
            include: {
              user: {
                select: {
                  id: true,
                  nom: true,
                  email: true,
                  role: true,
                  dateCreation: true,
                  dateModification: true,
                  actif: true,
                }
              },
              comptable: {
                include: {
                  user: {
                    select: {
                      nom: true,
                      email: true,
                    }
                  }
                }
              }
            }
          });
          return updatedClient;
        }

        // Si aucune donnée client à mettre à jour, récupérer le client mis à jour
        return tx.client.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                email: true,
                role: true,
                dateCreation: true,
                dateModification: true,
                actif: true,
              }
            },
            comptable: {
              include: {
                user: {
                  select: {
                    nom: true,
                    email: true,
                  }
                }
              }
            }
          }
        });
      });

      this.logger.log(`Client ${id} updated successfully by comptable ${comptableId}`);
      
      // Return success response with the updated client
      return {
        success: true,
        data: result
      };
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Violation de contrainte d\'unicité');
      }
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error updating client ${id}:`, error);
      throw new BadRequestException('Erreur lors de la mise à jour du client');
    }
  }

  async softDelete(id: number, userId: number) {
    // Get comptableId from userId
    const comptableId = await this.getComptableId(userId);

    this.logger.log(`Soft deleting client ${id} for comptable ${comptableId} (user ${userId})`);

    // Vérifier que le client existe et appartient au comptable
    const existingClient = await this.prisma.client.findFirst({
      where: {
        id,
        comptableId
      }
    });

    if (!existingClient) {
      this.logger.error(`Client ${id} not found for comptable ${comptableId}`);
      throw new NotFoundException('Client introuvable');
    }

    // Désactiver l'utilisateur au lieu de le supprimer
    await this.prisma.user.update({
      where: { id: existingClient.userId },
      data: {
        actif: false,
        dateModification: new Date()
      }
    });

    this.logger.log(`Client ${id} soft deleted successfully by comptable ${comptableId}`);

    return { message: 'Client désactivé avec succès' };
  }

  async getDashboardStats(userId: number): Promise<ClientDashboardStats> {
  // First, get the client by userId
  const client = await this.prisma.client.findUnique({
    where: { userId },
    select: { id: true }
  });

  if (!client) {
    throw new Error('Client not found');
  }

  // Get total factures count
  const totalFactures = await this.prisma.facture.count({
    where: {
      clientId: client.id
    }
  });

  // Get factures with status VALIDEE
  const facturesValidees = await this.prisma.facture.count({
    where: {
      clientId: client.id,
      status: 'VALIDEE'
    }
  });

  // Get dossiers with status EN_ATTENTE
  const dossiersEnAttente = await this.prisma.dossier.count({
    where: {
      clientId: client.id,
      status: 'EN_ATTENTE'
    }
  });

  // Optional: Calculate montant from VALIDEE factures
  const facturesData = await this.prisma.facture.aggregate({
    where: {
      clientId: client.id,
      status: 'VALIDEE'
    },
    _sum: {
      totalTTC: true
    }
  });

  return {
    totalFactures,
    facturesValidees,
    dossiersEnAttente,
    montantCaisse: facturesData._sum.totalTTC || 0
  };
}


}