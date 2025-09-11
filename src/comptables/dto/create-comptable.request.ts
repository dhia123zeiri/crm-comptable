import { IsEmail, IsString, IsStrongPassword, IsArray, IsOptional } from 'class-validator';

export class CreateComptableRequest {
  @IsString()
  nom: string;

  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  cabinet: string;

  @IsString()
  specialites: string;

  @IsOptional()
  @IsString()
  numeroOrdre?: string;
}
