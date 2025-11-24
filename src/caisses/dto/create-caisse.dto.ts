// dto/create-caisse.dto.ts
import { IsString, IsBoolean, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCaisseDto {
  @IsString()
  nom: string;

  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = false;

  @IsNumber()
  clientId: number;
}

export class UpdateCaisseDto {
  @IsString()
  @IsOptional()
  nom?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// New DTO for batch operations
export class SaveClientCaisseDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  nom: string;

  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = false;

  @IsNumber()
  clientId: number;
}

export class SaveClientCaissesDto {
  @IsNumber()
  clientId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveClientCaisseDto)
  caisses: SaveClientCaisseDto[];
}