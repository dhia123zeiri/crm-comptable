import { IsString, IsEmail, IsOptional, IsNotEmpty, MinLength } from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  siret?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  raisonSociale?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  codePostal?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  typeActivite?: string;

  @IsOptional()
  @IsString()
  regimeFiscal?: string;
}