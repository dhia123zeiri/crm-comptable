import { IsArray, IsNotEmpty, IsEnum, ArrayNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { TypeDocument } from '@prisma/client';

export class CreateDocumentsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Au moins un client doit être sélectionné' })
  @Transform(({ value }) => {
    // Si c'est une chaîne (cas du form-data), on la transforme en array
    if (typeof value === 'string') {
      return value.split(',').map(id => parseInt(id.trim(), 10));
    }
    // Si c'est déjà un array, on s'assure que les IDs sont des nombres
    if (Array.isArray(value)) {
      return value.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
    }
    return value;
  })
  clientIds: number[];

  @IsArray()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(type => type.trim());
    }
    return value;
  })
  documentTypes: TypeDocument[];
}