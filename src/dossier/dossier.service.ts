import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusDossier, PeriodeDossier, StatusDocumentRequest, TypeDocument, StatusUpload } from '@prisma/client';
import { DossierBatchResponseDto, DossierProgressSummaryDto } from './dto/dossier-response.dto';
import { CreateMultiClientDossierDto } from './dto/create-dossier.dto';
import { createReadStream } from 'fs';
import { join } from 'path';
import * as fs from 'fs';

// Add this interface to your existing interfaces
export interface DocumentContentResponse {
  id: number;
  content: string; // base64 encoded content or URL
  contentType: string;
  filename: string;
  size: number;
  isViewable: boolean;
}

@Injectable()
export class DossierService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create dossiers for multiple clients at once
   */
  async createMultiClientDossier(
    comptableId: number,
    createDossierDto: CreateMultiClientDossierDto,
  ): Promise<DossierBatchResponseDto> {
    const { clientIds, nom, description, periode, dateEcheance, dossierTemplateId, documentRequests } = createDossierDto;

    // Validate input
    if (!clientIds || clientIds.length === 0) {
      throw new BadRequestException('At least one client must be selected');
    }

    if (!nom || nom.trim().length === 0) {
      throw new BadRequestException('Dossier name is required');
    }

    if (!documentRequests || documentRequests.length === 0) {
      throw new BadRequestException('At least one document request is required');
    }

    // Verify comptable exists
    const comptable = await this.prisma.comptable.findUnique({
      where: { id: comptableId },
      include: { clients: true },
    });

    if (!comptable) {
      throw new NotFoundException('Comptable not found');
    }

    // Verify all clients belong to this comptable
    const validClientIds = comptable.clients.map(c => c.id);
    const invalidClientIds = clientIds.filter(id => !validClientIds.includes(id));

    if (invalidClientIds.length > 0) {
      throw new BadRequestException(`Invalid client IDs: ${invalidClientIds.join(', ')}`);
    }

    // Get client details
    const clients = await this.prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, raisonSociale: true },
    });

    return await this.prisma.$transaction(async (prisma) => {
      // Create dossier batch
      const dossierBatch = await prisma.dossierBatch.create({
        data: {
          nom,
          description,
          periode,
          dateEcheance,
          comptableId,
          dossierTemplateId,
        },
      });

      const createdDossiers: DossierBatchResponseDto['dossiers'] = [];

      // Create individual dossiers for each client
      for (const client of clients) {
        const dossierNom = `${nom} - ${client.raisonSociale}`;
        
        const dossier = await prisma.dossier.create({
          data: {
            nom: dossierNom,
            description,
            periode,
            dateEcheance,
            status: StatusDossier.EN_ATTENTE,
            pourcentage: 0,
            documentsUpload: 0,
            documentsRequis: documentRequests.length,
            clientId: client.id,
            comptableId,
            dossierTemplateId,
            dossierBatchId: dossierBatch.id,
          },
        });

        // Create document requests for this dossier
        const documentRequestsData = documentRequests.map(req => ({
          ...req,
          status: StatusDocumentRequest.EN_ATTENTE,
          clientId: client.id,
          comptableId,
          dossierId: dossier.id,
        }));

        await prisma.documentRequest.createMany({
          data: documentRequestsData,
        });

        createdDossiers.push({
          id: dossier.id,
          nom: dossier.nom,
          clientId: client.id,
          clientName: client.raisonSociale,
          status: dossier.status,
          documentsRequis: documentRequests.length,
        });
      }

      // Create notifications for clients
      const notifications = clients.map(client => ({
        titre: 'Nouveau dossier documentaire',
        message: `Un nouveau dossier "${nom}" a été créé et nécessite votre attention.`,
        type: 'DOCUMENT_RECU' as const,
        clientId: client.id,
      }));

      await prisma.notification.createMany({
        data: notifications,
      });

      return {
        batchId: dossierBatch.id,
        dossiersCreated: createdDossiers.length,
        dossiers: createdDossiers,
      };
    });
  }

  /**
   * Get progress summary for comptable's dossiers
   */
  async getComptableDossiersProgress(comptableId: number, batchId?: number): Promise<DossierProgressSummaryDto> {
    const whereClause: any = { comptableId };
    if (batchId) {
      whereClause.dossierBatchId = batchId;
    }

    const dossiers = await this.prisma.dossier.findMany({
      where: whereClause,
      include: {
        client: {
          select: { raisonSociale: true },
        },
        documentRequests: {
          include: {
            uploads: true, // Include uploads to count them properly
          },
        },
      },
      orderBy: { dateCreation: 'desc' },
    });

    const progressData = dossiers.map(dossier => {
      const totalRequests = dossier.documentRequests.length;
      let completedRequests = 0;

      // FIXED: Use the same logic as updateDossierProgress - only count valid uploads
      dossier.documentRequests.forEach(request => {
        const validUploads = request.uploads.filter(
          upload => upload.status === 'VALIDE' || upload.status === 'EN_REVISION'
        ).length;
        
        if (validUploads >= request.quantiteMin) {
          completedRequests++;
        }
      });
      
      const progress = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;

      return {
        id: dossier.id,
        nom: dossier.nom,
        clientName: dossier.client.raisonSociale,
        progress, // Use calculated progress instead of dossier.pourcentage if needed
        documentsUpload: dossier.documentsUpload,
        documentsRequis: dossier.documentsRequis,
        status: dossier.status,
      };
    });

    // Rest of your method remains the same...
    const totalDossiers = progressData.length;
    const completedDossiers = progressData.filter(d => d.status === StatusDossier.COMPLET).length;
    const inProgressDossiers = progressData.filter(d => d.status === StatusDossier.EN_COURS).length;
    const pendingDossiers = progressData.filter(d => d.status === StatusDossier.EN_ATTENTE).length;

    const overallProgress = totalDossiers > 0 
      ? Math.round(progressData.reduce((sum, d) => sum + d.progress, 0) / totalDossiers)
      : 0;

    return {
      batchId,
      totalDossiers,
      completedDossiers,
      inProgressDossiers,
      pendingDossiers,
      overallProgress,
      dossiers: progressData,
    };
  }

  /**
   * Get all clients for a comptable (for the dropdown)
   */
  async getComptableClients(comptableId: number) {
    return await this.prisma.client.findMany({
      where: { comptableId },
      select: {
        id: true,
        raisonSociale: true,
        typeActivite: true,
        regimeFiscal: true,
        derniereConnexion: true,
      },
      orderBy: { raisonSociale: 'asc' },
    });
  }

  /**
   * Get dossier templates for a comptable (for the dropdown)
   */
  async getComptableDossierTemplates(comptableId: number) {
    return await this.prisma.dossierTemplate.findMany({
      where: { comptableId, actif: true },
      include: {
        documentsRequis: {
          select: {
            typeDocument: true,
            obligatoire: true,
            quantiteMin: true,
            quantiteMax: true,
            formatAccepte: true,
            tailleMaxMo: true,
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * FIXED: Enhanced updateDossierProgress method with comprehensive logging and proper status management
   */
  async updateDossierProgress(dossierId: number): Promise<void> {
    console.log(`🔍 Starting updateDossierProgress for dossier ID: ${dossierId}`);
    
    const dossier = await this.prisma.dossier.findUnique({
      where: { id: dossierId },
      include: {
        documentRequests: {
          include: {
            uploads: true,
          },
        },
      },
    });

    if (!dossier) {
      console.error(`❌ Dossier ${dossierId} not found`);
      throw new NotFoundException('Dossier not found');
    }

    console.log(`📂 Found dossier: "${dossier.nom}" with ${dossier.documentRequests.length} requests`);
    console.log(`📊 Current state: ${dossier.pourcentage}% progress, ${dossier.documentsUpload} uploads, status: ${dossier.status}`);

    const totalRequests = dossier.documentRequests.length;
    let completedRequests = 0;
    let totalUploads = 0;
    let hasAnyUploads = false;
    let hasValidatedUploads = 0;
    let hasRefusedUploads = 0;
    let hasOnlyRefusedUploads = true; // Track if client only has refused uploads

    console.log(`\n📋 Analyzing ${totalRequests} document requests:`);

    for (const request of dossier.documentRequests) {
      totalUploads += request.uploads.length;
      
      if (request.uploads.length > 0) {
        hasAnyUploads = true;
      }
      
      const validatedUploads = request.uploads.filter(
        upload => upload.status === StatusUpload.VALIDE
      ).length;
      
      const reviewUploads = request.uploads.filter(
        upload => upload.status === StatusUpload.EN_REVISION
      ).length;
      
      const refusedUploads = request.uploads.filter(
        upload => upload.status === StatusUpload.REFUSE
      ).length;
      
      hasValidatedUploads += validatedUploads;
      hasRefusedUploads += refusedUploads;
      
      // Check if this request has any non-refused uploads
      if (validatedUploads > 0 || reviewUploads > 0) {
        hasOnlyRefusedUploads = false;
      }
      
      const totalValidUploads = validatedUploads + reviewUploads;
      
      console.log(`\n  📄 Request "${request.titre}" (ID: ${request.id}):`);
      console.log(`    - Current status: ${request.status}`);
      console.log(`    - Required: ${request.quantiteMin}-${request.quantiteMax} documents`);
      console.log(`    - Total uploads: ${request.uploads.length}`);
      console.log(`    - Validated: ${validatedUploads}`);
      console.log(`    - In review: ${reviewUploads}`);
      console.log(`    - Refused: ${refusedUploads}`);
      console.log(`    - Total valid (validated + review): ${totalValidUploads}`);
      
      // Update request status based on uploads
      let newRequestStatus = request.status;
      let requestCompleted = false;
      
      if (validatedUploads >= request.quantiteMin) {
        // Fully validated - request is complete
        completedRequests++;
        requestCompleted = true;
        newRequestStatus = StatusDocumentRequest.VALIDE;
        console.log(`    ✅ Request COMPLETED (fully validated)`);
      } else if (totalValidUploads >= request.quantiteMin) {
        // Has enough uploads but some are still in review
        completedRequests++;
        requestCompleted = true;
        newRequestStatus = StatusDocumentRequest.RECU;
        console.log(`    🔄 Request COMPLETED (has minimum uploads in review)`);
      } else if (reviewUploads > 0 || validatedUploads > 0) {
        // Has some uploads but not enough
        newRequestStatus = StatusDocumentRequest.RECU;
        console.log(`    ⏳ Request IN PROGRESS (has uploads but not enough)`);
      } else if (refusedUploads > 0 && totalValidUploads === 0) {
        // FIXED: Only has refused uploads, reset to EN_ATTENTE for client to reupload
        newRequestStatus = StatusDocumentRequest.EN_ATTENTE;
        console.log(`    🔄 Request RESET to EN_ATTENTE (only refused uploads)`);
        
        // FIXED: Create notification for client to re-upload refused documents
        await this.prisma.notification.create({
          data: {
            titre: 'Document refusé - Action requise',
            message: `Votre document "${request.titre}" a été refusé. Veuillez uploader un nouveau document pour continuer.`,
            type: 'DOCUMENT_RECU',
            clientId: dossier.clientId,
          },
        });
      } else {
        // No uploads yet
        newRequestStatus = StatusDocumentRequest.EN_ATTENTE;
        console.log(`    ⏸️  Request PENDING (no uploads)`);
      }
      
      // Update request status if it changed
      if (newRequestStatus !== request.status) {
        console.log(`    🔄 Updating request status: ${request.status} → ${newRequestStatus}`);
        try {
          await this.prisma.documentRequest.update({
            where: { id: request.id },
            data: { status: newRequestStatus },
          });
          console.log(`    ✅ Request status updated successfully`);
        } catch (error) {
          console.error(`    ❌ Failed to update request status:`, error);
        }
      } else {
        console.log(`    ℹ️  Request status unchanged: ${request.status}`);
      }
    }

    // FIXED: Calculate correct document upload count (exclude refused-only uploads)
    const validUploadCount = await this.prisma.documentUpload.count({
      where: {
        documentRequest: {
          dossierId: dossierId
        },
        status: {
          in: [StatusUpload.VALIDE, StatusUpload.EN_REVISION]
        }
      }
    });

    // Calculate progress based on completed requests
    const progress = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;
    
    // ENHANCED STATUS LOGIC
    let status: StatusDossier = StatusDossier.EN_ATTENTE;
    
    if (progress === 100 && hasValidatedUploads === validUploadCount && validUploadCount > 0) {
      // All documents are validated - dossier is complete and ready for final validation
      status = StatusDossier.COMPLET;
    } else if (hasAnyUploads && !hasOnlyRefusedUploads) {
      // Has some valid uploads (not only refused) - dossier is in progress
      status = StatusDossier.EN_COURS;
    } else {
      // No uploads at all or only refused uploads - dossier is waiting
      status = StatusDossier.EN_ATTENTE;
    }

    console.log(`\n📈 Progress calculation:`);
    console.log(`  - Completed requests: ${completedRequests}/${totalRequests}`);
    console.log(`  - Progress percentage: ${progress}%`);
    console.log(`  - Valid uploads: ${validUploadCount}`);
    console.log(`  - Has any uploads: ${hasAnyUploads}`);
    console.log(`  - Has only refused uploads: ${hasOnlyRefusedUploads}`);
    console.log(`  - Validated uploads: ${hasValidatedUploads}`);
    console.log(`  - Refused uploads: ${hasRefusedUploads}`);
    console.log(`  - New status: ${status}`);
    console.log(`  - Previous progress: ${dossier.pourcentage}%`);
    console.log(`  - Previous uploads: ${dossier.documentsUpload}`);
    console.log(`  - Previous status: ${dossier.status}`);

    // Check if anything changed
    const progressChanged = dossier.pourcentage !== progress;
    const uploadsChanged = dossier.documentsUpload !== validUploadCount;
    const statusChanged = dossier.status !== status;
    
    if (progressChanged || uploadsChanged || statusChanged) {
      console.log(`\n🔄 Changes detected, updating dossier:`);
      if (progressChanged) console.log(`  - Progress: ${dossier.pourcentage}% → ${progress}%`);
      if (uploadsChanged) console.log(`  - Uploads: ${dossier.documentsUpload} → ${validUploadCount}`);
      if (statusChanged) console.log(`  - Status: ${dossier.status} → ${status}`);
      
      try {
        await this.prisma.dossier.update({
          where: { id: dossierId },
          data: {
            pourcentage: progress,
            documentsUpload: validUploadCount, // FIXED: Use correct count
            status: status,
            dateModification: new Date(),
            // Only set completion date when status becomes COMPLET
            dateCompletion: status === StatusDossier.COMPLET && dossier.status !== StatusDossier.COMPLET 
              ? new Date() 
              : dossier.dateCompletion,
          },
        });
        
        console.log(`✅ Dossier ${dossierId} updated successfully!`);
        console.log(`📊 Final state: ${progress}% progress, ${validUploadCount} uploads, status: ${status}`);
        
      } catch (error) {
        console.error(`❌ Failed to update dossier ${dossierId}:`, error);
        throw error;
      }
    } else {
      console.log(`ℹ️  No changes needed for dossier ${dossierId}`);
    }
    
    console.log(`🏁 updateDossierProgress completed for dossier ${dossierId}\n`);
  }

  /**
   * Get detailed dossier information
   */
  async getDossierDetails(dossierId: number, comptableId: number) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { 
        id: dossierId,
        comptableId, // Ensure comptable owns this dossier
      },
      include: {
        client: {
          select: {
            id: true,
            raisonSociale: true,
            typeActivite: true,
          },
        },
        dossierBatch: {
          select: {
            id: true,
            nom: true,
          },
        },
        documentRequests: {
          include: {
            uploads: {
              include: {
                document: {
                  select: {
                    id: true,
                    nom: true,
                    nomOriginal: true,
                    taille: true,
                    typeFichier: true,
                    dateUpload: true,
                  },
                },
              },
            },
          },
          orderBy: { dateCreation: 'asc' },
        },
      },
    });

    if (!dossier) {
      throw new NotFoundException('Dossier not found or access denied');
    }

    return dossier;
  }

  /**
   * FIXED: Validate or reject uploaded documents with proper error handling
   */
  async validateDocumentUpload(
    uploadId: number, 
    action: 'VALIDE' | 'REFUSE', 
    comptableId: number,
    commentaire?: string
  ): Promise<{ success: boolean; message: string }> {
    console.log(`🔍 Starting document validation: uploadId=${uploadId}, action=${action}, comptableId=${comptableId}`);
    
    // Verify the document upload exists and belongs to comptable's clients
    const documentUpload = await this.prisma.documentUpload.findFirst({
      where: { 
        id: uploadId,
        documentRequest: {
          comptableId: comptableId // Ensure comptable owns this document request
        }
      },
      include: {
        document: {
          select: { nomOriginal: true }
        },
        documentRequest: {
          include: {
            client: {
              select: { raisonSociale: true }
            },
            dossier: {
              select: { id: true, nom: true }
            }
          }
        }
      }
    });

    if (!documentUpload) {
      console.error(`❌ Document upload ${uploadId} not found or access denied`);
      throw new NotFoundException('Document upload not found or access denied');
    }

    console.log(`📄 Found document: "${documentUpload.document.nomOriginal}" from ${documentUpload.documentRequest.client.raisonSociale}`);
    console.log(`📂 Dossier: "${documentUpload.documentRequest.dossier?.nom}"`);

    try {
      // FIXED: Use transaction to ensure consistency
      const result = await this.prisma.$transaction(async (prisma) => {
        // Update the document upload status
        const updatedUpload = await prisma.documentUpload.update({
          where: { id: uploadId },
          data: {
            status: action === 'VALIDE' ? StatusUpload.VALIDE : StatusUpload.REFUSE,
            dateValidation: new Date(),
            commentaire: commentaire || `${action === 'VALIDE' ? 'Validé' : 'Refusé'} par le comptable le ${new Date().toLocaleString('fr-FR')}`
          }
        });

        // Create notification for client
        await prisma.notification.create({
          data: {
            titre: `Document ${action === 'VALIDE' ? 'validé' : 'refusé'}`,
            message: `Votre document "${documentUpload.document.nomOriginal}" a été ${action === 'VALIDE' ? 'validé' : 'refusé'} par votre comptable.${commentaire ? ` Commentaire: ${commentaire}` : ''}`,
            type: 'DOCUMENT_RECU',
            clientId: documentUpload.documentRequest.clientId,
          }
        });

        return updatedUpload;
      });

      console.log(`✅ Document upload status updated to: ${result.status}`);
      console.log(`🔔 Notification created for client`);

      // Update dossier progress after validation
      if (documentUpload.documentRequest.dossierId) {
        console.log(`🔄 Updating dossier progress for dossier ${documentUpload.documentRequest.dossierId}`);
        await this.updateDossierProgress(documentUpload.documentRequest.dossierId);
      }

      return {
        success: true,
        message: `Document ${action === 'VALIDE' ? 'validé' : 'refusé'} avec succès`
      };
    } catch (error) {
      console.error(`❌ Error during document validation:`, error);
      throw error;
    }
  }

  /**
   * FIXED: Validate a complete dossier (COMPLET → VALIDE) with proper validation
   */
  async validateCompleteDossier(
    dossierId: number, 
    comptableId: number,
    commentaire?: string
  ): Promise<{ success: boolean; message: string }> {
    console.log(`🏆 Starting dossier validation: dossierId=${dossierId}, comptableId=${comptableId}`);
    
    // Verify the dossier exists, belongs to comptable, and is complete
    const dossier = await this.prisma.dossier.findFirst({
      where: { 
        id: dossierId,
        comptableId: comptableId,
        status: StatusDossier.COMPLET // Only allow validation of complete dossiers
      },
      include: {
        client: {
          select: { raisonSociale: true }
        },
        documentRequests: {
          include: {
            uploads: {
              where: {
                status: StatusUpload.VALIDE
              }
            }
          }
        }
      }
    });

    if (!dossier) {
      console.error(`❌ Dossier ${dossierId} not found, not owned by comptable, or not complete`);
      throw new NotFoundException('Dossier not found, access denied, or dossier not complete');
    }

    console.log(`📂 Found complete dossier: "${dossier.nom}" for ${dossier.client.raisonSociale}`);

    // Double-check that all document requests are actually satisfied
    const allRequestsSatisfied = dossier.documentRequests.every(request => 
      request.uploads.length >= request.quantiteMin
    );

    if (!allRequestsSatisfied) {
      console.error(`❌ Not all document requests are satisfied`);
      throw new BadRequestException('Cannot validate dossier: not all document requirements are met');
    }

    try {
      // FIXED: Use transaction for consistency
      const result = await this.prisma.$transaction(async (prisma) => {
        // Update dossier status to VALIDE
        const updatedDossier = await prisma.dossier.update({
          where: { id: dossierId },
          data: {
            status: StatusDossier.VALIDE,
            dateModification: new Date(),
            // Keep the completion date, don't change it
          }
        });

        // Create notification for client
        await prisma.notification.create({
          data: {
            titre: 'Dossier validé et archivé',
            message: `Félicitations ! Votre dossier "${dossier.nom}" a été validé et archivé par votre comptable.${commentaire ? ` Commentaire: ${commentaire}` : ''}`,
            type: 'DOCUMENT_RECU',
            clientId: dossier.clientId,
          }
        });

        return updatedDossier;
      });

      console.log(`✅ Dossier status updated to: ${result.status}`);
      console.log(`🔔 Validation notification created for client`);

      return {
        success: true,
        message: 'Dossier validé et archivé avec succès'
      };
    } catch (error) {
      console.error(`❌ Error during dossier validation:`, error);
      throw error;
    }
  }

  /**
   * FIXED: Upload documents for a specific document request with enhanced upload limit validation
   */
  async uploadDocumentsForRequest(
    dossierId: number,
    documentRequestId: number,
    clientId: number,
    uploadedFiles: Array<{
      filename: string;
      originalName: string;
      size: number;
      mimetype: string;
      path?: string;
    }>
  ) {
    console.log(`📤 Starting document upload process:`);
    console.log(`  - Dossier ID: ${dossierId}`);
    console.log(`  - Request ID: ${documentRequestId}`);
    console.log(`  - Client ID: ${clientId}`);
    console.log(`  - Files count: ${uploadedFiles.length}`);

    // Verify the document request belongs to the client and dossier
    const documentRequest = await this.prisma.documentRequest.findFirst({
      where: {
        id: documentRequestId,
        dossierId,
        clientId,
      },
      include: {
        dossier: {
          select: { 
            nom: true, 
            comptableId: true,
            client: {
              select: { raisonSociale: true }
            }
          },
        },
        uploads: true, // Include ALL uploads to properly check limits
      },
    });

    if (!documentRequest) {
      console.error(`❌ Document request not found or access denied`);
      throw new NotFoundException('Document request not found or access denied');
    }

    console.log(`✅ Document request found: "${documentRequest.titre}"`);
    console.log(`📂 Dossier: "${documentRequest.dossier?.nom}"`);
    console.log(`👤 Client: "${documentRequest.dossier?.client?.raisonSociale}"`);

    const comptableId = documentRequest.dossier?.comptableId;
    if (!comptableId) {
      console.error(`❌ Comptable ID not found for this dossier`);
      throw new Error('Comptable ID not found for this dossier');
    }

    // FIXED: Enhanced upload limits check - only count valid uploads (exclude REFUSE)
    const currentValidUploads = documentRequest.uploads.filter(
      upload => upload.status === StatusUpload.VALIDE || upload.status === StatusUpload.EN_REVISION
    ).length;
    const currentRefusedUploads = documentRequest.uploads.filter(
      upload => upload.status === StatusUpload.REFUSE
    ).length;
    const newUploadsCount = uploadedFiles.length;
    
    console.log(`📊 Enhanced upload limits check:`);
    console.log(`  - Total uploads in DB: ${documentRequest.uploads.length}`);
    console.log(`  - Current valid uploads (VALIDE + EN_REVISION): ${currentValidUploads}`);
    console.log(`  - Current refused uploads: ${currentRefusedUploads}`);
    console.log(`  - New uploads: ${newUploadsCount}`);
    console.log(`  - Min required: ${documentRequest.quantiteMin}`);
    console.log(`  - Max allowed: ${documentRequest.quantiteMax || 'unlimited'}`);
    
    // FIXED: Check if adding new uploads would exceed maximum allowed (excluding refused uploads)
    if (documentRequest.quantiteMax && (currentValidUploads + newUploadsCount > documentRequest.quantiteMax)) {
      const remainingSlots = documentRequest.quantiteMax - currentValidUploads;
      const errorMsg = `Maximum ${documentRequest.quantiteMax} document(s) autorisé(s). Vous avez déjà ${currentValidUploads} document(s) valide(s) uploadé(s)${currentRefusedUploads > 0 ? ` et ${currentRefusedUploads} refusé(s)` : ''}. Vous ne pouvez ajouter que ${remainingSlots} document(s) supplémentaire(s).`;
      console.error(`❌ ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }

    console.log(`🔄 Starting database transaction...`);
    
    return await this.prisma.$transaction(async (prisma) => {
      const documentUploads: Array<{
        id: number;
        status: StatusUpload;
        dateUpload: Date;
        documentId: number;
        documentRequestId: number;
        commentaire: string | null;
        dateValidation: Date | null;
        document: {
          nom: string;
          nomOriginal: string;
          taille: number;
          dateUpload: Date;
        };
      }> = [];
      
      console.log(`📝 Processing ${uploadedFiles.length} files...`);
      
      for (const [index, file] of uploadedFiles.entries()) {
        console.log(`  📄 Processing file ${index + 1}/${uploadedFiles.length}: "${file.originalName}"`);
        
        // Create the Document record
        const document = await prisma.document.create({
          data: {
            nom: file.filename,
            nomOriginal: file.originalName,
            chemin: file.path || `/uploads/documents/${file.filename}`,
            taille: file.size,
            typeDocument: documentRequest.typeDocument,
            typeFichier: file.mimetype,
            clientId: clientId,
            comptableId: comptableId,
          },
        });

        console.log(`    ✅ Document created with ID: ${document.id}`);

        // Create the DocumentUpload record
        const upload = await prisma.documentUpload.create({
          data: {
            documentId: document.id,
            documentRequestId,
            status: StatusUpload.EN_REVISION,
            commentaire: `Uploadé par le client le ${new Date().toLocaleString('fr-FR')}`,
          },
          include: {
            document: {
              select: {
                nom: true,
                nomOriginal: true,
                taille: true,
                dateUpload: true,
              },
            },
          },
        });
        
        console.log(`    ✅ DocumentUpload created with ID: ${upload.id}, status: ${upload.status}`);
        documentUploads.push(upload);
      }

      console.log(`🔄 Updating document request status to RECU...`);
      
      // Update document request status to RECU (received)
      await prisma.documentRequest.update({
        where: { id: documentRequestId },
        data: {
          status: StatusDocumentRequest.RECU,
          dateCompletion: new Date(),
        },
      });

      console.log(`✅ Document request status updated to RECU`);

      // Create notification for comptable
      console.log(`🔔 Creating notification for comptable...`);
      
      await prisma.notification.create({
        data: {
          titre: 'Nouveaux documents reçus',
          message: `${uploadedFiles.length} nouveau(x) document(s) reçu(s) de ${documentRequest.dossier?.client?.raisonSociale || 'Client'} pour "${documentRequest.titre}" dans le dossier "${documentRequest.dossier?.nom || 'Dossier inconnu'}"`,
          type: 'DOCUMENT_RECU',
          comptableId: comptableId,
        },
      });

      console.log(`✅ Notification created for comptable`);
      console.log(`🔄 Transaction completed successfully`);

      return {
        success: true,
        uploadedCount: documentUploads.length,
        documentUploads,
        message: `${documentUploads.length} document(s) uploadé(s) avec succès et en cours de révision`,
      };
    }).then(async (result) => {
      // Call updateDossierProgress AFTER transaction completes
      console.log(`📊 Calling updateDossierProgress for dossier ${dossierId}...`);
      
      try {
        await this.updateDossierProgress(dossierId);
        console.log(`✅ Progress update completed successfully for dossier ${dossierId}`);
      } catch (progressError) {
        console.error(`❌ Failed to update progress for dossier ${dossierId}:`, progressError);
        // Don't throw here - the upload was successful, just log the progress update failure
      }
      
      return result;
    });
  }

  /**
   * FIXED: Get all dossiers for a specific client with proper upload counting
   */
  async getClientDossiers(clientId: number) {
    // Verify client exists
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, raisonSociale: true, comptableId: true },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const dossiers = await this.prisma.dossier.findMany({
      where: { clientId },
      include: {
        comptable: {
          select: {
            cabinet: true,
            user: {
              select: { nom: true, email: true },
            },
          },
        },
        documentRequests: {
          include: {
            uploads: {
              include: {
                document: {
                  select: {
                    nom: true,
                    nomOriginal: true,
                    taille: true,
                    dateUpload: true,
                  },
                },
              },
            },
          },
          orderBy: { dateCreation: 'asc' },
        },
        dossierBatch: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
      orderBy: { dateCreation: 'desc' },
    });

    // FIXED: Calculate progress for each dossier with correct upload counting (exclude refused uploads)
    const dossiersWithProgress = dossiers.map(dossier => {
      const totalRequests = dossier.documentRequests.length;
      let completedRequests = 0;
      let validUploadCount = 0;

      dossier.documentRequests.forEach(request => {
        // FIXED: Count only VALIDE and EN_REVISION uploads (exclude REFUSE)
        const validUploads = request.uploads.filter(
          upload => upload.status === 'VALIDE' || upload.status === 'EN_REVISION'
        ).length;
        validUploadCount += validUploads;
        
        // Consider request completed if minimum uploads are met
        if (validUploads >= request.quantiteMin) {
          completedRequests++;
        }
      });

      const progress = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;
      
      return {
        ...dossier,
        pourcentage: progress,
        documentsUpload: validUploadCount, // Use correct count
        isUrgent: dossier.dateEcheance ? new Date(dossier.dateEcheance) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) : false,
      };
    });

    return {
      dossiers: dossiersWithProgress,
      summary: {
        total: dossiersWithProgress.length,
        enCours: dossiersWithProgress.filter(d => d.status === StatusDossier.EN_COURS).length,
        enAttente: dossiersWithProgress.filter(d => d.status === StatusDossier.EN_ATTENTE).length,
        complets: dossiersWithProgress.filter(d => d.status === StatusDossier.COMPLET).length,
        valides: dossiersWithProgress.filter(d => d.status === StatusDossier.VALIDE).length,
        urgents: dossiersWithProgress.filter(d => d.isUrgent).length,
      },
    };
  }

  /**
   * Get detailed information about a specific dossier for a client
   */
  async getClientDossierDetails(dossierId: number, clientId: number) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { 
        id: dossierId,
        clientId, // Ensure client owns this dossier
      },
      include: {
        comptable: {
          select: {
            id: true,
            cabinet: true,
            user: {
              select: { nom: true, email: true },
            },
          },
        },
        dossierBatch: {
          select: {
            id: true,
            nom: true,
          },
        },
        documentRequests: {
          include: {
            uploads: {
              include: {
                document: {
                  select: {
                    id: true,
                    nom: true,
                    nomOriginal: true,
                    taille: true,
                    dateUpload: true,
                    typeFichier: true,
                  },
                },
              },
              orderBy: { dateUpload: 'desc' },
            },
          },
          orderBy: { dateCreation: 'asc' },
        },
      },
    });

    if (!dossier) {
      throw new NotFoundException('Dossier not found or access denied');
    }

    // FIXED: Calculate detailed progress excluding refused uploads
    const totalRequests = dossier.documentRequests.length;
    let completedRequests = 0;
    let validUploadCount = 0;
    let pendingRequests = 0;

    dossier.documentRequests.forEach(request => {
      const validUploads = request.uploads.filter(
        upload => upload.status === 'VALIDE' || upload.status === 'EN_REVISION'
      ).length;
      validUploadCount += validUploads;
      
      if (validUploads >= request.quantiteMin) {
        completedRequests++;
      } else if (request.uploads.length > 0) {
        // Has uploads but not enough or not validated
        request.status = StatusDocumentRequest.RECU;
      } else {
        pendingRequests++;
      }
    });

    const progress = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;

    return {
      ...dossier,
      pourcentage: progress,
      documentsUpload: validUploadCount,
      summary: {
        totalRequests,
        completedRequests,
        pendingRequests,
        totalUploads: validUploadCount,
      },
      isUrgent: dossier.dateEcheance ? new Date(dossier.dateEcheance) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) : false,
    };
  }

  /**
   * Get client statistics for dashboard
   */
  async getClientStatistics(clientId: number) {
    const [
      totalDossiers,
      completedDossiers,
      inProgressDossiers,
      pendingDossiers,
      totalDocumentUploads,
      pendingDocumentRequests,
      urgentDossiers,
      recentNotifications
    ] = await Promise.all([
      this.prisma.dossier.count({
        where: { clientId },
      }),
      this.prisma.dossier.count({
        where: { clientId, status: StatusDossier.COMPLET },
      }),
      this.prisma.dossier.count({
        where: { clientId, status: StatusDossier.EN_COURS },
      }),
      this.prisma.dossier.count({
        where: { clientId, status: StatusDossier.EN_ATTENTE },
      }),
      this.prisma.documentUpload.count({
        where: {
          documentRequest: { clientId },
          status: { in: [StatusUpload.VALIDE, StatusUpload.EN_REVISION] }
        },
      }),
      this.prisma.documentRequest.count({
        where: {
          clientId,
          status: StatusDocumentRequest.EN_ATTENTE,
        },
      }),
      this.prisma.dossier.count({
        where: {
          clientId,
          dateEcheance: {
            lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Next 3 days
            gte: new Date(),
          },
        },
      }),
      this.prisma.notification.findMany({
        where: { clientId },
        orderBy: { dateCreation: 'desc' },
        take: 5,
      }),
    ]);

    const completionRate = totalDossiers > 0 ? Math.round((completedDossiers / totalDossiers) * 100) : 0;

    return {
      totalDossiers,
      completedDossiers,
      inProgressDossiers,
      pendingDossiers,
      totalDocumentUploads,
      pendingDocumentRequests,
      urgentDossiers,
      completionRate,
      recentNotifications,
    };
  }

  /**
   * Get client notifications
   */
  async getClientNotifications(clientId: number, limit: number = 10, offset: number = 0) {
    const notifications = await this.prisma.notification.findMany({
      where: { clientId },
      orderBy: { dateCreation: 'desc' },
      skip: offset,
      take: limit,
    });

    const totalCount = await this.prisma.notification.count({
      where: { clientId },
    });

    const unreadCount = await this.prisma.notification.count({
      where: { clientId, lu: false },
    });

    return {
      notifications,
      totalCount,
      unreadCount,
      hasMore: offset + notifications.length < totalCount,
    };
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: number, clientId: number) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, clientId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found or access denied');
    }

    return await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        lu: true,
        dateLecture: new Date(),
      },
    });
  }

  /**
   * Get batch summary with all related dossiers
   */
  async getBatchSummary(batchId: number, comptableId: number) {
    const batch = await this.prisma.dossierBatch.findFirst({
      where: {
        id: batchId,
        comptableId,
      },
      include: {
        dossiers: {
          include: {
            client: {
              select: {
                id: true,
                raisonSociale: true,
              },
            },
            documentRequests: {
              select: {
                status: true,
              },
            },
          },
        },
        dossierTemplate: {
          select: {
            nom: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found or access denied');
    }

    // Calculate progress for each dossier in batch
    const dossiersWithProgress = batch.dossiers.map(dossier => {
      const totalRequests = dossier.documentRequests.length;
      const completedRequests = dossier.documentRequests.filter(
        req => req.status === StatusDocumentRequest.VALIDE
      ).length;
      
      const progress = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;

      return {
        id: dossier.id,
        nom: dossier.nom,
        client: dossier.client,
        status: dossier.status,
        progress,
        totalRequests,
        completedRequests,
        dateCreation: dossier.dateCreation,
      };
    });

    return {
      ...batch,
      dossiers: dossiersWithProgress,
      summary: {
        totalDossiers: dossiersWithProgress.length,
        completedDossiers: dossiersWithProgress.filter(d => d.status === StatusDossier.COMPLET).length,
        inProgressDossiers: dossiersWithProgress.filter(d => d.status === StatusDossier.EN_COURS).length,
        pendingDossiers: dossiersWithProgress.filter(d => d.status === StatusDossier.EN_ATTENTE).length,
        averageProgress: dossiersWithProgress.length > 0 
          ? Math.round(dossiersWithProgress.reduce((sum, d) => sum + d.progress, 0) / dossiersWithProgress.length)
          : 0,
      },
    };
  }

  /**
   * Duplicate an existing dossier to multiple clients
   */
  async duplicateDossierToClients(
    originalDossierId: number,
    targetClientIds: number[],
    comptableId: number,
    newNom?: string,
  ): Promise<DossierBatchResponseDto> {
    // Get original dossier with its document requests
    const originalDossier = await this.prisma.dossier.findFirst({
      where: {
        id: originalDossierId,
        comptableId,
      },
      include: {
        documentRequests: true,
      },
    });

    if (!originalDossier) {
      throw new NotFoundException('Original dossier not found');
    }

    // Verify target clients
    const clients = await this.prisma.client.findMany({
      where: {
        id: { in: targetClientIds },
        comptableId,
      },
      select: { id: true, raisonSociale: true },
    });

    if (clients.length !== targetClientIds.length) {
      throw new BadRequestException('Some target clients not found or access denied');
    }

    return await this.prisma.$transaction(async (prisma) => {
      // Create new batch
      const batchNom = newNom || `${originalDossier.nom} - Copie`;
      const dossierBatch = await prisma.dossierBatch.create({
        data: {
          nom: batchNom,
          description: originalDossier.description,
          periode: originalDossier.periode,
          dateEcheance: originalDossier.dateEcheance,
          comptableId,
          dossierTemplateId: originalDossier.dossierTemplateId,
        },
      });

      const createdDossiers: DossierBatchResponseDto['dossiers'] = [];

      // Create dossiers for each target client
      for (const client of clients) {
        const dossierNom = `${batchNom} - ${client.raisonSociale}`;
        
        const newDossier = await prisma.dossier.create({
          data: {
            nom: dossierNom,
            description: originalDossier.description,
            periode: originalDossier.periode,
            dateEcheance: originalDossier.dateEcheance,
            status: StatusDossier.EN_ATTENTE,
            pourcentage: 0,
            documentsUpload: 0,
            documentsRequis: originalDossier.documentRequests.length,
            clientId: client.id,
            comptableId,
            dossierTemplateId: originalDossier.dossierTemplateId,
            dossierBatchId: dossierBatch.id,
          },
        });

        // Copy document requests
        const documentRequestsData = originalDossier.documentRequests.map(req => ({
          titre: req.titre,
          description: req.description,
          typeDocument: req.typeDocument,
          obligatoire: req.obligatoire,
          quantiteMin: req.quantiteMin,
          quantiteMax: req.quantiteMax,
          formatAccepte: req.formatAccepte,
          tailleMaxMo: req.tailleMaxMo,
          dateEcheance: req.dateEcheance,
          instructions: req.instructions,
          status: StatusDocumentRequest.EN_ATTENTE,
          clientId: client.id,
          comptableId,
          dossierId: newDossier.id,
        }));

        await prisma.documentRequest.createMany({
          data: documentRequestsData,
        });

        createdDossiers.push({
          id: newDossier.id,
          nom: newDossier.nom,
          clientId: client.id,
          clientName: client.raisonSociale,
          status: newDossier.status,
          documentsRequis: originalDossier.documentRequests.length,
        });
      }

      return {
        batchId: dossierBatch.id,
        dossiersCreated: createdDossiers.length,
        dossiers: createdDossiers,
      };
    });
  }

  /**
   * Archive completed dossiers
   */
  async archiveDossier(dossierId: number, comptableId: number): Promise<void> {
    const dossier = await this.prisma.dossier.findFirst({
      where: {
        id: dossierId,
        comptableId,
        status: StatusDossier.COMPLET,
      },
    });

    if (!dossier) {
      throw new NotFoundException('Dossier not found, access denied, or not completed');
    }

    await this.prisma.dossier.update({
      where: { id: dossierId },
      data: {
        status: StatusDossier.VALIDE,
        dateModification: new Date(),
      },
    });

    // Create notification for client
    await this.prisma.notification.create({
      data: {
        titre: 'Dossier archivé',
        message: `Votre dossier "${dossier.nom}" a été validé et archivé.`,
        type: 'DOCUMENT_RECU',
        clientId: dossier.clientId,
      },
    });
  }

  /**
   * Get statistics for comptable dashboard
   */
  async getComptableStatistics(comptableId: number) {
    const [
      totalDossiers,
      completedDossiers,
      inProgressDossiers,
      pendingDossiers,
      totalClients,
      recentActivity
    ] = await Promise.all([
      this.prisma.dossier.count({
        where: { comptableId },
      }),
      this.prisma.dossier.count({
        where: { comptableId, status: StatusDossier.COMPLET },
      }),
      this.prisma.dossier.count({
        where: { comptableId, status: StatusDossier.EN_COURS },
      }),
      this.prisma.dossier.count({
        where: { comptableId, status: StatusDossier.EN_ATTENTE },
      }),
      this.prisma.client.count({
        where: { comptableId },
      }),
      this.prisma.documentUpload.findMany({
        where: {
          documentRequest: {
            comptableId,
          },
        },
        include: {
          document: {
            select: { nomOriginal: true },
          },
          documentRequest: {
            include: {
              client: {
                select: { raisonSociale: true },
              },
            },
          },
        },
        orderBy: { dateUpload: 'desc' },
        take: 10,
      }),
    ]);

    const completionRate = totalDossiers > 0 ? Math.round((completedDossiers / totalDossiers) * 100) : 0;

    return {
      totalDossiers,
      completedDossiers,
      inProgressDossiers,
      pendingDossiers,
      totalClients,
      completionRate,
      recentActivity: recentActivity.map(activity => ({
        id: activity.id,
        documentName: activity.document.nomOriginal,
        clientName: activity.documentRequest.client.raisonSociale,
        status: activity.status,
        dateUpload: activity.dateUpload,
      })),
    };
  }

  /**
   * Get documents by status for comptable dashboard
   */
  async getDocumentsByStatus(comptableId: number, status?: StatusUpload) {
    const whereClause: any = {
      documentRequest: {
        comptableId: comptableId
      }
    };

    if (status) {
      whereClause.status = status;
    }

    const uploads = await this.prisma.documentUpload.findMany({
      where: whereClause,
      include: {
        document: {
          select: {
            id: true,
            nomOriginal: true,
            taille: true,
            typeFichier: true,
            dateUpload: true,
          }
        },
        documentRequest: {
          include: {
            client: {
              select: {
                id: true,
                raisonSociale: true,
              }
            },
            dossier: {
              select: {
                id: true,
                nom: true,
              }
            }
          }
        }
      },
      orderBy: { dateUpload: 'desc' },
      take: 50, // Limit to recent uploads
    });

    return uploads.map(upload => ({
      id: upload.id,
      status: upload.status,
      dateUpload: upload.dateUpload,
      dateValidation: upload.dateValidation,
      commentaire: upload.commentaire,
      document: upload.document,
      client: upload.documentRequest.client,
      dossier: upload.documentRequest.dossier,
      requestTitle: upload.documentRequest.titre,
    }));
  }

  /**
   * Get pending validations for comptable dashboard
   */
  async getPendingValidations(comptableId: number) {
    return await this.getDocumentsByStatus(comptableId, StatusUpload.EN_REVISION);
  }

  /**
   * Bulk validate documents
   */
  async bulkValidateDocuments(
    uploadIds: number[], 
    action: 'VALIDE' | 'REFUSE', 
    comptableId: number,
    commentaire?: string
  ): Promise<{ success: boolean; validated: number; errors: string[] }> {
    const results = {
      success: true,
      validated: 0,
      errors: [] as string[]
    };

    for (const uploadId of uploadIds) {
      try {
        await this.validateDocumentUpload(uploadId, action, comptableId, commentaire);
        results.validated++;
      } catch (error) {
        results.errors.push(`Upload ${uploadId}: ${error.message}`);
      }
    }

    if (results.errors.length > 0) {
      results.success = false;
    }

    return results;
  }

async getDocumentContent(documentId: number, comptableId: number): Promise<DocumentContentResponse> {
  console.log(`🔍 Getting document content for documentId: ${documentId}, comptableId: ${comptableId}`);
  
  // Validate input parameters
  if (!documentId || isNaN(documentId) || documentId <= 0) {
    console.error(`❌ Invalid document ID: ${documentId}`);
    throw new BadRequestException('Invalid document ID');
  }

  if (!comptableId || isNaN(comptableId) || comptableId <= 0) {
    console.error(`❌ Invalid comptable ID: ${comptableId}`);
    throw new BadRequestException('Invalid comptable ID');
  }
  
  // Find the document and verify access
  const document = await this.prisma.document.findFirst({
    where: {
      id: documentId,
      comptableId: comptableId, // Ensure comptable owns this document
    },
    select: {
      id: true,
      nom: true,
      nomOriginal: true,
      chemin: true,
      taille: true,
      typeFichier: true,
      dateUpload: true,
    },
  });

  if (!document) {
    console.error(`❌ Document ${documentId} not found or access denied for comptable ${comptableId}`);
    throw new NotFoundException('Document not found or access denied');
  }

  console.log(`📄 Found document: "${document.nomOriginal}" at path: ${document.chemin}`);

  const filePath = document.chemin;
  const fullPath = join(process.cwd(), filePath);

  // Check if file exists on disk
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found on disk: ${fullPath}`);
    throw new NotFoundException('File not found on disk');
  }

  try {
    // Read file content
    const fileBuffer = fs.readFileSync(fullPath);
    const base64Content = fileBuffer.toString('base64');

    // Determine if the file is viewable in browser
    const viewableTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/json'
    ];

    const isViewable = viewableTypes.includes(document.typeFichier);

    console.log(`✅ Document content loaded successfully. Size: ${fileBuffer.length} bytes, Viewable: ${isViewable}`);

    return {
      id: document.id,
      content: base64Content,
      contentType: document.typeFichier,
      filename: document.nomOriginal,
      size: document.taille,
      isViewable,
    };
  } catch (error) {
    console.error(`❌ Error reading file content:`, error);
    throw new Error(`Failed to read document content: ${error.message}`);
  }
}

/**
 * Download document file (alternative to viewing)
 */
async getDocumentForDownload(documentId: number, comptableId: number) {
  console.log(`📥 Preparing document for download: documentId: ${documentId}`);
  
  // Validate input parameters
  if (!documentId || isNaN(documentId) || documentId <= 0) {
    console.error(`❌ Invalid document ID: ${documentId}`);
    throw new BadRequestException('Invalid document ID');
  }

  if (!comptableId || isNaN(comptableId) || comptableId <= 0) {
    console.error(`❌ Invalid comptable ID: ${comptableId}`);
    throw new BadRequestException('Invalid comptable ID');
  }
  
  // Find the document and verify access
  const document = await this.prisma.document.findFirst({
    where: {
      id: documentId,
      comptableId: comptableId,
    },
    select: {
      id: true,
      nom: true,
      nomOriginal: true,
      chemin: true,
      taille: true,
      typeFichier: true,
    },
  });

  if (!document) {
    console.error(`❌ Document ${documentId} not found or access denied for comptable ${comptableId}`);
    throw new NotFoundException('Document not found or access denied');
  }

  const filePath = document.chemin;
  const fullPath = join(process.cwd(), filePath);

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found on disk: ${fullPath}`);
    throw new NotFoundException('File not found on disk');
  }

  console.log(`✅ Document ready for download: "${document.nomOriginal}"`);

  return {
    document,
    filePath: fullPath,
  };
}

async getDossiersClient(userId: number) {
  

  return await this.prisma.dossier.findMany({
    where: {
      clientId: userId
    },
    orderBy: [
      { dateEcheance: 'asc' },
      { dateCreation: 'desc' }
    ]
  });
}


 
}