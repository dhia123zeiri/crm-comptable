// src/dynamic-forms/dto/dynamic-form.dto.ts
import { IsString, IsOptional, IsBoolean, IsInt, IsArray, ValidateNested, IsEnum, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum FieldType {
  TEXT = 'text',
  EMAIL = 'email',
  TEL = 'tel',
  NUMBER = 'number',
  DATE = 'date',
  TEXTAREA = 'textarea',
  SELECT = 'select',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',
  FILE = 'file',
  SIGNATURE = 'signature'
}

export class FieldValidationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  minLength?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsString()
  patternMessage?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  min?: number;

  @IsOptional()
  @IsInt()
  max?: number;

  @IsOptional()
  @IsString()
  accept?: string; // for file uploads
}

export class DynamicFormFieldDto {
  @IsEnum(FieldType)
  type: FieldType;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldValidationDto)
  validation?: FieldValidationDto;
}

export class CreateDynamicFormDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicFormFieldDto)
  fields: DynamicFormFieldDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expirationDays?: number = 30;

  @IsOptional()
  @IsBoolean()
  requiresAuthentication?: boolean = true;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateDynamicFormDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicFormFieldDto)
  fields?: DynamicFormFieldDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expirationDays?: number;

  @IsOptional()
  @IsBoolean()
  requiresAuthentication?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SubmitDynamicFormDto {
  @IsString()
  token: string; // Email token for authentication

  responses: Record<string, any>; // Dynamic field responses

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

// Updated template DTOs to include dynamic form
export class CreateTemplateDto {
  @IsString()
  nom: string;

  @IsString()
  subject: string;

  @IsString()
  content: string;

  @IsEnum(['REMINDER', 'INVOICE', 'INFO', 'CUSTOM'])
  type: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  actif?: boolean = true;

  @IsOptional()
  @IsBoolean()
  isPeriodic?: boolean = false;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  clientIds?: number[];

  @IsOptional()
  @IsBoolean()
  sendToAllClients?: boolean = false;

  @IsOptional()
  @IsBoolean()
  includeForm?: boolean = false;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDynamicFormDto)
  dynamicForm?: CreateDynamicFormDto;
}