import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateComptableRequest } from './dto/create-comptable.request';
import { TokenPayload } from 'src/auth/token-payload.interface';
import { StatusDossier } from '@prisma/client';

@Injectable()
export class ComptableService {
  constructor(private readonly prisma: PrismaService) {}

  async createComptable(data: CreateComptableRequest) {
    try {
      // Transformer la chaîne en tableau
      const specialitesArray =
        typeof data.specialites === 'string'
          ? data.specialites
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0)
          : [];
      console.log(specialitesArray);

      return await this.prisma.user.create({
        data: {
          nom: data.nom,
          email: data.email,
          password: await bcrypt.hash(data.password, 10),
          role: 'COMPTABLE',
          comptable: {
            create: {
              cabinet: data.cabinet,
              specialites: specialitesArray,
              numeroOrdre: data.numeroOrdre || null,
            },
          },
        },
        include: {
          comptable: true,
        },
      });
    } catch (err) {
      console.error(err);
      if (err.code === 'P2002') {
        throw new UnprocessableEntityException('Email already exists');
      }
      throw err;
    }
  }

  async getDashboardStats(id:number){
        const comptable = await this.prisma.comptable.findUnique({
      where: { userId: id },
    });

    if (!comptable) {
      throw new Error('Comptable not found');
    }

    // Exécuter toutes les requêtes en parallèle pour optimiser les performances
    const [
      totalClients,
      dossiersComplets,
      pendingFormsCount,
      allDossiers
    ] = await Promise.all([
      // 1. Total des clients
      this.prisma.client.count({
        where: { comptableId: comptable.id },
      }),

      // 2. Dossiers complets (COMPLET ou VALIDE)
      this.prisma.dossier.count({
        where: {
          comptableId: comptable.id,
          status: {
            in: [StatusDossier.COMPLET, StatusDossier.VALIDE],
          },
        },
      }),

      // 3. Formulaires dynamiques en attente de réponse
      this.prisma.dynamicFormResponse.count({
        where: {
          dynamicForm: {
            comptableId: comptable.id,
          },
          status: 'PENDING',
        },
      }),

      // 4. Tous les dossiers pour calculer le taux de complétion
      this.prisma.dossier.findMany({
        where: { comptableId: comptable.id },
        select: { pourcentage: true },
      }),
    ]);

    // Calculer le taux de complétion moyen
    const completionRate = allDossiers.length > 0
      ? Math.round(
          allDossiers.reduce((sum, d) => sum + d.pourcentage, 0) / allDossiers.length
        )
      : 0;

    return {
      totalClients,
      dossiersComplets,
      pendingForms: pendingFormsCount,
      completionRate,
    };
  }

  
}
