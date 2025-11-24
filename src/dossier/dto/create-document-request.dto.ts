import { 
  IsNotEmpty, 
  IsString, 
  IsOptional, 
  IsBoolean, 
  IsNumber, 
  Min, 
  Max, 
  IsArray, 
  ArrayMinSize, 
  ArrayMaxSize, 
  MaxLength, 
  IsEnum,
  IsDateString,
  MinLength,
  IsPositive,
  ValidateNested
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TypeDocument } from '@prisma/client';





export class CreateDocumentRequestDtoSimple {
  @IsNotEmpty()
  @IsString()
  titre: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum(TypeDocument)
  typeDocument: TypeDocument;

  @IsNotEmpty()
  @IsBoolean()
  obligatoire: boolean;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(50)
  quantiteMin: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quantiteMax?: number;

  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  formatAccepte: string[];

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(500)
  tailleMaxMo: number;

  // ✅ Accept ISO string or undefined/null  
  @IsOptional()
  @IsDateString({}, { message: 'Date must be in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ) or empty' })
  dateEcheance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}

