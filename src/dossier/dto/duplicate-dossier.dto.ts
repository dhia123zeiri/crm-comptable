import { 
  IsNotEmpty, 
  IsString, 
  IsOptional, 
  IsArray, 
  IsNumber, 
  ArrayMinSize,
  MinLength,
  MaxLength,
  IsPositive
} from 'class-validator';
import { Transform } from 'class-transformer';

export class DuplicateDossierDto {
  @IsNotEmpty({ message: 'L\'ID du dossier original est obligatoire' })
  @IsNumber({}, { message: 'L\'ID du dossier original doit être un nombre' })
  @IsPositive({ message: 'L\'ID du dossier original doit être un nombre positif' })
  originalDossierId: number;

  @IsNotEmpty({ message: 'Au moins un client cible doit être sélectionné' })
  @IsArray({ message: 'targetClientIds doit être un tableau' })
  @ArrayMinSize(1, { message: 'Au moins un client cible doit être sélectionné' })
  @IsNumber({}, { each: true, message: 'Chaque ID de client cible doit être un nombre' })
  @IsPositive({ each: true, message: 'Chaque ID de client cible doit être un nombre positif' })
  targetClientIds: number[];

  @IsOptional()
  @IsString({ message: 'Le nouveau nom doit être une chaîne de caractères' })
  @MinLength(3, { message: 'Le nouveau nom doit contenir au moins 3 caractères' })
  @MaxLength(100, { message: 'Le nouveau nom ne peut pas dépasser 100 caractères' })
  @Transform(({ value }) => value?.trim())
  newNom?: string;
}