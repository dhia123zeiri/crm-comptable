
import { 
  IsNotEmpty, 
  IsString, 
  IsOptional, 
  IsArray, 
  ArrayMinSize, 
  MinLength, 
  MaxLength, 
  IsNumber, 
  IsPositive, 
  ValidateNested,
  IsDateString,
  IsDate
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {  CreateDocumentRequestDtoSimple } from './create-document-request.dto';

export class CreateMultiClientDossierDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  periode?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // If empty string, null, or undefined, return undefined
    if (!value || value === '') return undefined;
    // If it's already a Date object, return it
    if (value instanceof Date) return value;
    // If it's an ISO string, convert to Date
    if (typeof value === 'string') return new Date(value);
    return value;
  })
  @Type(() => Date)
  @IsDate()
  dateEcheance?: Date;

  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  @IsPositive({ each: true })
  clientIds: number[];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  dossierTemplateId?: number;

  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentRequestDtoSimple)
  documentRequests: CreateDocumentRequestDtoSimple[];
}