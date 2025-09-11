// documents.controller.ts - Configuration alternative

import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  UseInterceptors, 
  UploadedFiles,
  BadRequestException 
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/role.decorator';
import { CurrentUser } from 'src/auth/current-user.decorator';
import type { TokenPayload } from 'src/auth/token-payload.interface';
import { CreateDocumentsDto } from './dto/documents.dto';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @Roles(Role.COMPTABLE, Role.ADMIN)
  @UseInterceptors(FilesInterceptor('files', 20, {
    dest: './temp', // Dossier temporaire - sera supprimé après traitement
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
    },
    fileFilter: (req, file, callback) => {
      const allowedMimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      
      if (allowedMimeTypes.includes(file.mimetype)) {
        callback(null, true);
      } else {
        callback(new BadRequestException('Type de fichier non autorisé'), false);
      }
    }
  }))
  async uploadDocuments(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: TokenPayload
  ) {
    console.log('=== DEBUG UPLOAD ALTERNATIVE ===');
    console.log('Nombre de fichiers reçus:', files?.length || 0);
    console.log('Fichiers détails:', files?.map(f => ({
      name: f?.originalname,
      path: f?.path,
      size: f?.size,
      mimetype: f?.mimetype,
      hasBuffer: !!f?.buffer,
      bufferLength: f?.buffer?.length,
      bufferType: typeof f?.buffer,
      destination: f?.destination,
      filename: f?.filename
    })));

    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Parse form data (même logique qu'avant)
    let clientIds: number[];
    let documentTypes: string[];

    try {
      if (Array.isArray(body.clientIds)) {
        clientIds = body.clientIds.map((id: string) => parseInt(id, 10));
      } else if (typeof body.clientIds === 'string') {
        if (body.clientIds.startsWith('[')) {
          clientIds = JSON.parse(body.clientIds);
        } else {
          clientIds = [parseInt(body.clientIds, 10)];
        }
      } else {
        throw new Error('Format clientIds invalide');
      }

      if (Array.isArray(body.documentTypes)) {
        documentTypes = body.documentTypes;
      } else if (typeof body.documentTypes === 'string') {
        if (body.documentTypes.startsWith('[')) {
          documentTypes = JSON.parse(body.documentTypes);
        } else {
          documentTypes = [body.documentTypes];
        }
      } else {
        throw new Error('Format documentTypes invalide');
      }

      if (!Array.isArray(clientIds) || clientIds.some(id => isNaN(id))) {
        throw new Error('IDs clients invalides');
      }

      if (!Array.isArray(documentTypes)) {
        throw new Error('Types de documents invalides');
      }

    } catch (error) {
      console.error('Erreur de parsing des données:', error);
      throw new BadRequestException('Format des données invalide: ' + error.message);
    }

    if (!clientIds || clientIds.length === 0) {
      throw new BadRequestException('Aucun client sélectionné');
    }

    const createDocumentsDto: CreateDocumentsDto = {
      clientIds,
      documentTypes: documentTypes as any[]
    };

    return this.documentsService.uploadDocuments(files, createDocumentsDto, user.userId);
  }
}