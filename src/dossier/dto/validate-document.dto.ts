
// validate-document.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ValidateDocumentDto {
  @IsIn(['VALIDE', 'REFUSE'], {
    message: 'Action must be either VALIDE or REFUSE'
  })
  action: 'VALIDE' | 'REFUSE';

  @IsOptional()
  @IsString()
  commentaire?: string;
}