// documents.service.ts - Version modifiée pour gérer les fichiers temporaires

import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Document, TypeDocument, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class CreateDocumentsDto {
  clientIds: number[];
  documentTypes: TypeDocument[];
}

type DocumentWithClient = Document & {
  client: {
    id: number;
    raisonSociale: string;
    siret: string;
  };
};

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async uploadDocuments(
    files: Express.Multer.File[],
    createDocumentsDto: CreateDocumentsDto,
    comptableUserId: number
  ) {
    const comptable = await this.prisma.comptable.findUnique({
      where: { userId: comptableUserId },
      include: { clients: true }
    });

    if (!comptable) {
      throw new ForbiddenException('Comptable non trouvé');
    }

    const clientIds = createDocumentsDto.clientIds;
    const comptableClientIds = comptable.clients.map(c => c.id);
    
    const invalidClientIds = clientIds.filter(id => !comptableClientIds.includes(id));
    if (invalidClientIds.length > 0) {
      throw new ForbiddenException(`Clients non autorisés: ${invalidClientIds.join(', ')}`);
    }

    // Créer le dossier de stockage final
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const results: DocumentWithClient[] = [];
    const tempFilesToCleanup: string[] = [];

    try {
      for (const clientId of clientIds) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const documentType = createDocumentsDto.documentTypes[i] || TypeDocument.AUTRE;

          try {
            if (!file) {
              console.error(`Fichier manquant à l'index ${i}`);
              continue;
            }

            let fileBuffer: Buffer;

            // Méthode 1: Si le fichier a un buffer (stockage mémoire)
            if (file.buffer && file.buffer.length > 0) {
              console.log(`Utilisation du buffer en mémoire pour ${file.originalname}`);
              fileBuffer = file.buffer;
            }
            // Méthode 2: Si le fichier est stocké temporairement sur disque
            else if (file.path && fs.existsSync(file.path)) {
              console.log(`Lecture du fichier temporaire ${file.path} pour ${file.originalname}`);
              fileBuffer = fs.readFileSync(file.path);
              tempFilesToCleanup.push(file.path); // Marquer pour nettoyage
            }
            // Méthode 3: Essayer de lire le fichier à partir du nom de fichier généré par Multer
            else if (file.filename && file.destination) {
              const tempPath = path.join(file.destination, file.filename);
              if (fs.existsSync(tempPath)) {
                console.log(`Lecture du fichier temporaire généré ${tempPath} pour ${file.originalname}`);
                fileBuffer = fs.readFileSync(tempPath);
                tempFilesToCleanup.push(tempPath);
              } else {
                throw new Error(`Fichier temporaire non trouvé: ${tempPath}`);
              }
            }
            else {
              console.error(`Impossible de lire le fichier ${file.originalname}:`, {
                hasBuffer: !!file.buffer,
                bufferLength: file.buffer?.length,
                hasPath: !!file.path,
                pathExists: file.path ? fs.existsSync(file.path) : false,
                hasFilename: !!file.filename,
                hasDestination: !!file.destination
              });
              continue;
            }

            // Vérifier que nous avons maintenant un buffer valide
            if (!fileBuffer || fileBuffer.length === 0) {
              console.error(`Buffer vide pour ${file.originalname}`);
              continue;
            }

            console.log(`Traitement du fichier ${file.originalname}:`, {
              bufferLength: fileBuffer.length,
              fileSize: file.size,
              mimetype: file.mimetype,
              method: file.buffer ? 'memory' : 'disk'
            });

            // Générer un nom unique et sauvegarder dans le dossier final
            const fileExtension = path.extname(file.originalname);
            const uniqueFileName = `${uuidv4()}${fileExtension}`;
            const finalPath = path.join(uploadDir, uniqueFileName);

            fs.writeFileSync(finalPath, fileBuffer);

            // Enregistrer en base de données
            const document = await this.prisma.document.create({
              data: {
                nom: uniqueFileName,
                nomOriginal: file.originalname,
                chemin: finalPath,
                taille: fileBuffer.length, // Utiliser la taille réelle du buffer
                typeDocument: documentType,
                typeFichier: file.mimetype,
                clientId: clientId,
                comptableId: comptable.id,
                formulaireId: null
              },
              include: {
                client: {
                  select: {
                    id: true,
                    raisonSociale: true,
                    siret: true
                  }
                }
              }
            });

            results.push(document);

            // Créer une notification pour le client
            await this.prisma.notification.create({
              data: {
                titre: 'Nouveau document reçu',
                message: `Un nouveau document "${file.originalname}" a été uploadé pour votre compte.`,
                type: 'DOCUMENT_RECU',
                clientId: clientId
              }
            });

          } catch (error) {
            console.error(`Erreur lors du traitement du fichier ${file?.originalname || 'inconnu'} pour le client ${clientId}:`, error);
          }
        }
      }
    } finally {
      // Nettoyer les fichiers temporaires
      tempFilesToCleanup.forEach(tempFile => {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            console.log(`Fichier temporaire supprimé: ${tempFile}`);
          }
        } catch (error) {
          console.error(`Erreur lors de la suppression du fichier temporaire ${tempFile}:`, error);
        }
      });
    }

    return {
      success: true,
      message: `${results.length} documents uploadés avec succès`,
      documents: results,
      summary: {
        totalFiles: files.length,
        totalClients: clientIds.length,
        totalDocuments: results.length,
        clientsProcessed: clientIds,
        documentsPerClient: files.length,
        documentsPerClientTotal: files.length * clientIds.length
      }
    };
  }

  // ... autres méthodes restent identiques
}