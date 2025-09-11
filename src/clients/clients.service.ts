import { Injectable, Logger,ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';


@Injectable()
export class ClientsService {

    private readonly logger = new Logger(ClientsService.name);

  constructor(private prisma: PrismaService) {}

  async create(createClientDto: CreateClientDto, comptableId: number) {
    const { email, password, siret, ...clientData } = createClientDto;

    // Vérifier que le comptable existe en premier
    const comptable = await this.prisma.comptable.findUnique({
      where: { id: comptableId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable introuvable');
    }

    // Vérifications d'unicité en parallèle pour optimiser les performances
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
    const hashedPassword = await bcrypt.hash(password, 12); // Augmenté à 12 pour plus de sécurité

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

      return result;
    } catch (error) {
      // Gestion des erreurs de transaction
      if (error.code === 'P2002') {
        // Erreur d'unicité Prisma
        throw new ConflictException('Violation de contrainte d\'unicité');
      }
      throw new BadRequestException('Erreur lors de la création du client');
    }
  }

  async findAllByComptable(comptableId: number) {
    // Vérifier que le comptable existe
    const comptable = await this.prisma.comptable.findUnique({
      where: { id: comptableId }
    });

    if (!comptable) {
      throw new NotFoundException('Comptable introuvable');
    }

    return this.prisma.client.findMany({
      where: { 
        comptableId,
        user: {
          actif: true // Filtrer seulement les clients actifs
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

  async findOne(id: number, comptableId: number) {
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

    // Marquer l'email comme cliqué s'il ne l'a pas déjà été
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


  // Sauvegarder les réponses du formulaire
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

    // Vérifier la date d'expiration
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
      
      // Marquer l'email comme ayant reçu une réponse
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

}