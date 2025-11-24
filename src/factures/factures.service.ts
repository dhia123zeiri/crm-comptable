import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import PDFDocument from 'pdfkit';
import { Prisma, StatusFacture } from '@prisma/client';
import { CreateFactureDto } from './dto/create-facture.dto';

@Injectable()
export class FacturesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCabinetInfo(userId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId },
      select: {
        cabinet: true,
        numeroOrdre: true,
      },
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    return {
      cabinet: comptable.cabinet,
      numeroOrdre: comptable.numeroOrdre,
    };
  }

  async getClientInfo(userId: number, clientId: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        comptableId: comptable.id,
      },
      select: {
        id: true,
        raisonSociale: true,
        siret: true,
        adresse: true,
        codePostal: true,
        ville: true,
        telephone: true,
        user: {
          select: {
            email: true,
            nom: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client non trouvé');
    }

    return client;
  }

  async create(userId: number, createFactureDto: CreateFactureDto) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    // Vérifier que le client appartient au comptable
    const client = await this.prisma.client.findFirst({
      where: {
        id: createFactureDto.clientId,
        comptableId: comptable.id,
      },
    });

    if (!client) {
      throw new ForbiddenException('Client non autorisé');
    }

    // Générer le numéro de facture
    const numero = await this.generateNumeroFacture(comptable.id);

    // Calculer les totaux
    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    const lignesWithCalculations = createFactureDto.lignes.map((ligne, index) => {
      const montantHT = parseFloat((ligne.quantite * ligne.prixUnitaire).toFixed(2));
      const montantTVA = parseFloat((montantHT * (ligne.tauxTVA / 100)).toFixed(2));
      const montantTTC = parseFloat((montantHT + montantTVA).toFixed(2));

      totalHT += montantHT;
      totalTVA += montantTVA;
      totalTTC += montantTTC;

      return {
        description: ligne.description,
        quantite: ligne.quantite,
        prixUnitaire: ligne.prixUnitaire,
        tauxTVA: ligne.tauxTVA,
        montantHT,
        montantTVA,
        montantTTC,
        ordre: index,
      };
    });

    // Arrondir les totaux
    totalHT = parseFloat(totalHT.toFixed(2));
    totalTVA = parseFloat(totalTVA.toFixed(2));
    totalTTC = parseFloat(totalTTC.toFixed(2));

    // Créer la facture avec les lignes
    const facture = await this.prisma.facture.create({
      data: {
        numero,
        dateEmission: new Date(),
        dateEcheance: createFactureDto.dateEcheance,
        status: StatusFacture.VALIDEE,
        notes: createFactureDto.notes,
        totalHT,
        totalTVA,
        totalTTC,
        clientId: createFactureDto.clientId,
        comptableId: comptable.id,
        dateValidation: new Date(),
        lignes: {
          create: lignesWithCalculations,
        },
      },
      include: {
        lignes: true,
        client: {
          select: {
            raisonSociale: true,
            siret: true,
            user: {
              select: {
                email: true,
                nom: true,
              },
            },
          },
        },
      },
    });

    // TODO: Envoyer l'email au client avec la facture
    // await this.sendFactureEmail(facture);

    return {
      success: true,
      facture,
    };
  }

  async findAll(userId: number, status?: string, clientId?: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    const where: any = {
      comptableId: comptable.id,
    };

    if (status) {
      where.status = status as StatusFacture;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    const factures = await this.prisma.facture.findMany({
      where,
      include: {
        client: {
          select: {
            raisonSociale: true,
            siret: true,
          },
        },
        lignes: true,
      },
      orderBy: {
        dateCreation: 'desc',
      },
    });

    return factures;
  }

  async findOne(userId: number, id: number) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!comptable) {
      throw new NotFoundException('Comptable non trouvé');
    }

    const facture = await this.prisma.facture.findFirst({
      where: {
        id,
        comptableId: comptable.id,
      },
      include: {
        client: {
          select: {
            raisonSociale: true,
            siret: true,
            adresse: true,
            codePostal: true,
            ville: true,
            telephone: true,
            user: {
              select: {
                email: true,
                nom: true,
              },
            },
          },
        },
        lignes: {
          orderBy: {
            ordre: 'asc',
          },
        },
        comptable: {
          select: {
            cabinet: true,
            numeroOrdre: true,
          },
        },
      },
    });

    if (!facture) {
      throw new NotFoundException('Facture non trouvée');
    }

    return facture;
  }

  // ============================================
  // CLIENT METHODS
  // ============================================

  async findClientFactures(userId: number) {
    const client = await this.prisma.client.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException('Client non trouvé');
    }

    const factures = await this.prisma.facture.findMany({
      where: {
        clientId: client.id,
        status: {
          not: StatusFacture.BROUILLON, // Ne pas montrer les brouillons aux clients
        },
      },
      include: {
        lignes: {
          orderBy: {
            ordre: 'asc',
          },
        },
        comptable: {
          select: {
            cabinet: true,
            numeroOrdre: true,
            user: {
              select: {
                email: true,
                nom: true,
              },
            },
          },
        },
      },
      orderBy: {
        dateCreation: 'desc',
      },
    });

    return factures;
  }

  async findClientFacture(userId: number, factureId: number) {
    const client = await this.prisma.client.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException('Client non trouvé');
    }

    const facture = await this.prisma.facture.findFirst({
      where: {
        id: factureId,
        clientId: client.id,
        status: {
          not: StatusFacture.BROUILLON, // Ne pas montrer les brouillons aux clients
        },
      },
      include: {
        lignes: {
          orderBy: {
            ordre: 'asc',
          },
        },
        comptable: {
          select: {
            cabinet: true,
            numeroOrdre: true,
            user: {
              select: {
                email: true,
                nom: true,
              },
            },
          },
        },
        client: {
          select: {
            raisonSociale: true,
            siret: true,
            adresse: true,
            codePostal: true,
            ville: true,
            telephone: true,
            user: {
              select: {
                email: true,
                nom: true,
              },
            },
          },
        },
      },
    });

    if (!facture) {
      throw new NotFoundException('Facture non trouvée');
    }

    return facture;
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private async generateNumeroFacture(comptableId: number): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Compter les factures du mois en cours pour ce comptable
    const startOfMonth = new Date(year, now.getMonth(), 1);
    const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

    const count = await this.prisma.facture.count({
      where: {
        comptableId,
        dateCreation: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const sequence = String(count + 1).padStart(3, '0');
    const comptableCode = String(comptableId).padStart(5, '0');

    // Format: FAC-YYYY-MM-SEQ-COMPTABLE
    return `FAC-${year}-${month}-${sequence}-${comptableCode}`;
  }

  // Ajouter cette méthode dans la classe FacturesService

async getFacture(factureId: number) {
  const facture = await this.prisma.facture.findUnique({
    where: {
      id: factureId,
    },
  });

  if (!facture) {
    throw new NotFoundException('Facture non trouvée');
  }

  return facture;
}



// Then update the generatePDF method:
async generatePDF(facture: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('FACTURE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`N° ${facture.numero}`);
    doc.text(`Date: ${new Date(facture.dateEmission).toLocaleDateString('fr-FR')}`);
    doc.text(`Échéance: ${new Date(facture.dateEcheance).toLocaleDateString('fr-FR')}`);
    doc.moveDown();

    // Cabinet info
    doc.text(`Cabinet: ${facture.comptable.cabinet}`);
    if (facture.comptable.numeroOrdre) {
      doc.text(`N° Ordre: ${facture.comptable.numeroOrdre}`);
    }
    doc.moveDown();

    // Client info
    if (facture.client) {
      doc.text(`Client: ${facture.client.raisonSociale}`);
      doc.text(`SIRET: ${facture.client.siret}`);
      if (facture.client.adresse) {
        doc.text(`${facture.client.adresse}`);
        doc.text(`${facture.client.codePostal} ${facture.client.ville}`);
      }
    }
    doc.moveDown();

    // Lines table
    doc.text('Articles:', { underline: true });
    doc.moveDown(0.5);
    
    facture.lignes.forEach((ligne: any, index: number) => {
      doc.text(`${index + 1}. ${ligne.description}`);
      doc.text(`   Qté: ${ligne.quantite} × ${ligne.prixUnitaire.toFixed(2)}€ (TVA ${ligne.tauxTVA}%) = ${ligne.montantTTC.toFixed(2)}€`, {
        indent: 20
      });
    });
    doc.moveDown();

    // Totals
    doc.text(`Total HT: ${facture.totalHT.toFixed(2)}€`, { align: 'right' });
    doc.text(`Total TVA: ${facture.totalTVA.toFixed(2)}€`, { align: 'right' });
    doc.fontSize(14).text(`Total TTC: ${facture.totalTTC.toFixed(2)}€`, { align: 'right' });

    // Notes
    if (facture.notes) {
      doc.moveDown();
      doc.fontSize(10).text('Notes:', { underline: true });
      doc.text(facture.notes);
    }

    doc.end();
  });
}
  async update(factureId: number, data: Prisma.FactureUpdateInput) {
    await this.prisma.facture.update({
      where: { id: factureId },
      data,
    });
  }
}