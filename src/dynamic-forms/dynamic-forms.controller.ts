import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Ip, 
  Headers, 
  BadRequestException, 
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { DynamicFormsService } from './dynamic-forms.service';
import type { FormSubmissionDto } from './interfaces/form-submission.interface';

@Controller('dynamic-forms')
export class DynamicFormsController {
  constructor(
    private readonly dynamicFormService: DynamicFormsService
  ) {}

  @Get('token/:token')
  async getFormByToken(@Param('token') token: string) {
    return await this.dynamicFormService.getFormByToken(token);
  }

  /**
   * Utilise AnyFilesInterceptor pour accepter n'importe quel champ de fichier
   */
  @Post('submit/:token')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: './uploads/form-responses',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, callback) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'text/csv',
        ];

        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              `Type de fichier non autorisé: ${file.mimetype}`
            ),
            false
          );
        }
      },
    })
  )
  async submitForm(
    @Param('token') token: string,
    @Body() body: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent: string,
  ) {
    try {
      console.log('Received body:', body);
      console.log('Received files:', files?.length || 0);

      // Parser les responses
      let responses: Record<string, any> = {};
      if (body.responses) {
        try {
          responses = typeof body.responses === 'string' 
            ? JSON.parse(body.responses) 
            : body.responses;
        } catch (error) {
          throw new BadRequestException('Format de données invalide');
        }
      }

      // Organiser les fichiers par champ
      const filesByField: Record<string, Express.Multer.File[]> = {};
      if (files && files.length > 0) {
        files.forEach((file) => {
          // Extraire le label du champ depuis fieldname: files_Label_index
          const match = file.fieldname.match(/^files_(.+?)_\d+$/);
          if (match) {
            const fieldLabel = match[1];
            if (!filesByField[fieldLabel]) {
              filesByField[fieldLabel] = [];
            }
            filesByField[fieldLabel].push(file);
          }
        });
      }

      // Créer l'objet FormSubmissionDto conforme à votre interface
      const submitData: FormSubmissionDto = {
        responses,
        ipAddress: clientIp,
        userAgent: userAgent || '',
        files: Object.keys(filesByField).length > 0 ? filesByField : undefined,
      };

      return await this.dynamicFormService.handleSubmitForm(
        token,
        submitData,
        clientIp,
        userAgent
      );
    } catch (error) {
      console.error('Submit form error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Erreur lors du traitement de la soumission'
      );
    }
  }

  @Get('status/:token')
  async getFormStatus(@Param('token') token: string) {
    return await this.dynamicFormService.handleGetFormStatus(token);
  }
}