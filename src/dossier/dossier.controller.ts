import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  BadRequestException,
  UploadedFiles,
  UseInterceptors,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { createReadStream } from 'fs';
import type { Response } from 'express';

import { Role } from '@prisma/client';
import {
  DossierService,
} from './dossier.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/role.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { DossierBatchResponseDto, DossierProgressSummaryDto } from './dto/dossier-response.dto';
import { CreateMultiClientDossierDto } from './dto/create-dossier.dto';
import { ValidateDocumentDto } from './dto/validate-document.dto';

// Additional DTOs for API validation
export class DuplicateDossierDto {
  targetClientIds: number[];
  newNom?: string;
}

// Multer configuration for file uploads
const multerConfig = {
  storage: diskStorage({
    destination: './uploads/documents', // Make sure this directory exists
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = extname(file.originalname);
      callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  }),
  fileFilter: (req, file, callback) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5, // Maximum 5 files per request
  },
};

@Controller('dossiers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DossierController {
  constructor(private readonly dossierService: DossierService) {}
  /**
   * Create dossiers for multiple clients */
  
  @Post('multi-client')
  @Roles(Role.COMPTABLE)
  async createMultiClientDossier(
    @Body() createDossierDto: CreateMultiClientDossierDto,
    @CurrentUser() user: TokenPayload
  ): Promise<DossierBatchResponseDto> {
    const comptableId = user.userId;
    
    console.log(createDossierDto);
    console.log("comptableId:", comptableId);
    
    return await this.dossierService.createMultiClientDossier(comptableId, createDossierDto);
  }

  /**
   * Get all clients for dropdown
   */
  @Get('clients')
  @Roles(Role.COMPTABLE)
  async getClients(@CurrentUser() user: TokenPayload) {
    const comptableId = user.userId;
    return await this.dossierService.getComptableClients(comptableId);
  }

  /**
   * Get dossier templates for dropdown
   */
  @Get('templates')
  @Roles(Role.COMPTABLE)
  async getDossierTemplates(@CurrentUser() user: TokenPayload) {
    const comptableId = user.userId;
    return await this.dossierService.getComptableDossierTemplates(comptableId);
  }

  /**
   * Get progress summary for comptable's dossiers
   */
  @Get('progress')
  @Roles(Role.COMPTABLE)
  async getDossiersProgress(
    @CurrentUser() user: TokenPayload,
    @Query('batchId') batchId?: string,
  ): Promise<DossierProgressSummaryDto> {
    const comptableId = user.userId;
    const parsedBatchId = batchId ? parseInt(batchId) : undefined;
    return await this.dossierService.getComptableDossiersProgress(comptableId, parsedBatchId);
  }

  /**
   * Get comptable statistics
   */
  @Get('stats/dashboard')
  @Roles(Role.COMPTABLE)
  async getStatistics(@CurrentUser() user: TokenPayload) {
    const comptableId = user.userId;
    return await this.dossierService.getComptableStatistics(comptableId);
  }

  /**
   * Get document content for viewing
   */
  @Get('documents/:documentId/view')
  @Roles(Role.COMPTABLE)
  async getDocumentContent(
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: TokenPayload
  ) {
    const comptableId = user.userId;
    return await this.dossierService.getDocumentContent(documentId, comptableId);
  }

  /**
   * Download document file
   */
  @Get('documents/:documentId/download')
  @Roles(Role.COMPTABLE)
  async downloadDocument(
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: TokenPayload,
    @Res() res: Response
  ) {
    const comptableId = user.userId;
    
    try {
      const { document, filePath } = await this.dossierService.getDocumentForDownload(documentId, comptableId);
      
      // Set headers for file download
      res.setHeader('Content-Type', document.typeFichier);
      res.setHeader('Content-Disposition', `attachment; filename="${document.nomOriginal}"`);
      res.setHeader('Content-Length', document.taille.toString());
      
      // Stream the file
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
      
      console.log(`📥 Document download started: "${document.nomOriginal}"`);
      
    } catch (error) {
      console.error(`❌ Download error:`, error);
      res.status(404).json({ 
        message: 'Document not found or access denied',
        error: error.message 
      });
    }
  }

  /**
   * Get batch summary
   */
  @Get('batch/:batchId')
  @Roles(Role.COMPTABLE)
  async getBatchSummary(
    @Param('batchId', ParseIntPipe) batchId: number,
    @CurrentUser() user: TokenPayload
  ) {
    const comptableId = user.userId;
    return await this.dossierService.getBatchSummary(batchId, comptableId);
  }

  /**
   * Get detailed dossier information
   */
  @Get(':id')
  @Roles(Role.COMPTABLE, Role.CLIENT)
  async getDossierDetails(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: TokenPayload
  ) {
    
    if (user.role === Role.COMPTABLE) {
      return await this.dossierService.getDossierDetails(id, user.userId);
    } else {
      // For clients, ensure they can only access their own dossiers
      return await this.dossierService.getDossierDetails(id, user.userId);
    }
  }

   /**
   * FIXED: Validate or reject uploaded documents with proper error handling
   */
  @Post('documents/:uploadId/validate')
  @Roles(Role.COMPTABLE)
  async validateDocument(
    @Param('uploadId', ParseIntPipe) uploadId: number,
    @Body() validateDto: ValidateDocumentDto,
    @CurrentUser() user: TokenPayload
  ) {
    try {
      const comptableId = user.userId;
      
      console.log(`🔍 Controller: Validating document ${uploadId} with action ${validateDto.action}`);
      
      const result = await this.dossierService.validateDocumentUpload(
        uploadId, 
        validateDto.action, 
        comptableId,
        validateDto.commentaire
      );
      
      console.log(`✅ Controller: Validation successful`, result);
      return result;
      
    } catch (error) {
      console.error(`❌ Controller: Validation failed`, error);
      
      // Re-throw the error to let NestJS handle it properly
      throw error;
    }
  }

  /**
   * Duplicate existing dossier to multiple clients
   */
  @Post(':id/duplicate')
  @Roles(Role.COMPTABLE)
  async duplicateDossier(
    @Param('id', ParseIntPipe) originalDossierId: number,
    @Body() duplicateDto: DuplicateDossierDto,
    @CurrentUser() user: TokenPayload
  ): Promise<DossierBatchResponseDto> {
    const comptableId = user.userId
    
    return await this.dossierService.duplicateDossierToClients(
      originalDossierId,
      duplicateDto.targetClientIds,
      comptableId,
      duplicateDto.newNom,
    );
  }

  /**
   * Validate a complete dossier (COMPLET → VALIDE)
   */
  @Post(':id/validate')
  @Roles(Role.COMPTABLE)
  async validateDossier(
    @Param('id', ParseIntPipe) id: number,
    @Body() validateDto: { commentaire?: string },
    @CurrentUser() user: TokenPayload
  ) {
    const comptableId = user.userId;
    return await this.dossierService.validateCompleteDossier(
      id, 
      comptableId,
      validateDto.commentaire
    );
  }

  /**
   * Archive completed dossier
   */
  @Put(':id/archive')
  @Roles(Role.COMPTABLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveDossier(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: TokenPayload
  ): Promise<void> {
    const comptableId = user.userId
    await this.dossierService.archiveDossier(id, comptableId);
  }

  /**
   * Update dossier progress (internal use)
   */
  @Put(':id/progress')
  @Roles(Role.COMPTABLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProgress(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.dossierService.updateDossierProgress(id);
  }
}

@Controller('client/dossiers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientDossierController {
  constructor(private readonly dossierService: DossierService) {}

  /**
   * Get client's dossiers
   */
  @Get()
  @Roles(Role.CLIENT)
  async getClientDossiers(@CurrentUser() user: TokenPayload) {
    const clientId = user.userId;
    return await this.dossierService.getClientDossiers(clientId);
  }

  @Get('Dossiersclient')
@Roles(Role.CLIENT)
async getDossiersClient(@CurrentUser() user: TokenPayload) {
  return await this.dossierService.getDossiersClient(user.userId);
}

  /**
   * Get client dossier details
   */
  @Get(':id')
  @Roles(Role.CLIENT)
  async getClientDossierDetails(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: TokenPayload,
  ) {
    const clientId = user.userId;
    return await this.dossierService.getClientDossierDetails(id, clientId);
  }

  /**
   * Upload document for client dossier - FIXED VERSION
   */
  @Post(':id/documents/:requestId/upload')
  @Roles(Role.CLIENT)
  @UseInterceptors(FilesInterceptor('files', 5, multerConfig))
  async uploadDocument(
    @Param('id', ParseIntPipe) dossierId: number,
    @Param('requestId', ParseIntPipe) requestId: number,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: TokenPayload,
  ) {
    const clientId = user.userId;

    console.log('Upload attempt:', { dossierId, requestId, clientId, filesCount: files?.length });

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const uploadedDocuments = files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      path: file.path,
    }));

    const result = await this.dossierService.uploadDocumentsForRequest(
      dossierId,
      requestId,
      clientId,
      uploadedDocuments,
    );

    console.log('Upload successful:', result.message);
    return result;
  }
}

// Webhook controller for handling upload events
@Controller('webhooks/dossiers')
export class DossierWebhookController {
  constructor(private readonly dossierService: DossierService) {}

  /**
   * Handle document upload webhook
   */
  @Post('document-uploaded')
  @HttpCode(HttpStatus.OK)
  async handleDocumentUpload(
    @Body() payload: { dossierId: number },
  ) {
    try {
      await this.dossierService.updateDossierProgress(payload.dossierId);
      return { status: 'success' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// Export all controllers as a module
export const DossierControllers = [
  DossierController,
  ClientDossierController,
  DossierWebhookController,
];