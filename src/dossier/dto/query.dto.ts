import { IsOptional, IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class GetDossiersProgressQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'L\'ID du batch doit être un nombre' })
  @IsPositive({ message: 'L\'ID du batch doit être un nombre positif' })
  batchId?: number;
}

export class GetDossierDetailsParamsDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'L\'ID du dossier doit être un nombre' })
  @IsPositive({ message: 'L\'ID du dossier doit être un nombre positif' })
  dossierId: number;
}

export class GetBatchSummaryParamsDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'L\'ID du batch doit être un nombre' })
  @IsPositive({ message: 'L\'ID du batch doit être un nombre positif' })
  batchId: number;
}

export class ArchiveDossierParamsDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'L\'ID du dossier doit être un nombre' })
  @IsPositive({ message: 'L\'ID du dossier doit être un nombre positif' })
  dossierId: number;
}
