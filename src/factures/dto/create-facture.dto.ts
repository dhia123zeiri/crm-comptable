import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';

export class LigneFactureDto {
  @IsNotEmpty({ message: 'La description est requise' })
  @IsString()
  description: string;

  @IsNotEmpty({ message: 'La quantité est requise' })
  @IsNumber()
  @Min(1, { message: 'La quantité doit être au moins 1' })
  quantite: number;

  @IsNotEmpty({ message: 'Le prix unitaire est requis' })
  @IsNumber()
  @Min(0, { message: 'Le prix unitaire doit être positif' })
  prixUnitaire: number;

  @IsNotEmpty({ message: 'Le taux de TVA est requis' })
  @IsNumber()
  @Min(0, { message: 'Le taux de TVA doit être positif' })
  tauxTVA: number;
}

export class CreateFactureDto {
  @IsNotEmpty({ message: 'Le client est requis' })
  @IsNumber()
  clientId: number;

  @IsNotEmpty({ message: "La date d'échéance est requise" })
  @IsDateString()
  dateEcheance: Date;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNotEmpty({ message: 'Les lignes de facture sont requises' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins une ligne est requise' })
  @ValidateNested({ each: true })
  @Type(() => LigneFactureDto)
  lignes: LigneFactureDto[];
}
