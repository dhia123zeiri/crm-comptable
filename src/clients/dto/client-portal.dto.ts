// dto/client-portal.dto.ts
import { IsString, IsOptional, IsObject, IsEnum, IsDateString, IsArray, IsBoolean } from 'class-validator';
import { FormulaireStatus } from '@prisma/client';

export class CreateFormulaireDto {
  @IsString()
  titre: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  champs: any;

  @IsOptional()
  @IsDateString()
  dateExpiration?: string;
}

export class UpdateFormulaireDto {
  @IsString()
  @IsOptional()
  titre?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  champs?: any;

  @IsObject()
  @IsOptional()
  reponses?: any;

  @IsEnum(FormulaireStatus)
  @IsOptional()
  status?: FormulaireStatus;

  @IsDateString()
  @IsOptional()
  dateExpiration?: string;
}

export class SaveResponseDto {
  @IsObject()
  reponses: any;

  @IsEnum(['STARTED', 'COMPLETED'])
  @IsOptional()
  status?: 'STARTED' | 'COMPLETED' = 'STARTED';
}

export class UploadDocumentDto {
  @IsString()
  typeDocument: string;

  @IsString()
  @IsOptional()
  description?: string;
}