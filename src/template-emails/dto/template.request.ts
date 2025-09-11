// src/template-emails/dto/template.request.ts
import { IsString, IsEmail, IsBoolean, IsOptional, IsArray, IsEnum, IsInt, ArrayNotEmpty, IsDateString, Matches, ValidateNested, IsObject, Min, Max } from 'class-validator';
import { TemplateType, FormResponseStatus } from '@prisma/client';
import { Type } from 'class-transformer';

// Dynamic Form DTOs
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

// Template DTOs
export class CreateTemplateDto {
  @IsString()
  nom: string;

  @IsString()
  subject: string;

  @IsString()
  content: string;

  @IsEnum(TemplateType)
  type: TemplateType;

  @IsString()
  category: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  actif?: boolean = true;

  @IsBoolean()
  @IsOptional()
  isPeriodic?: boolean = false;

  @IsString()
  @IsOptional()
  cronExpression?: string | null;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  clientIds?: number[];

  @IsBoolean()
  @IsOptional()
  sendToAllClients?: boolean = false;

  @IsBoolean()
  @IsOptional()
  includeForm?: boolean = false;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDynamicFormDto)
  dynamicForm?: CreateDynamicFormDto;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  nom?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsEnum(TemplateType)
  @IsOptional()
  type?: TemplateType;

  @IsString()
  @IsOptional()
  category?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  actif?: boolean;

  @IsBoolean()
  @IsOptional()
  isPeriodic?: boolean;

  @IsString()
  @IsOptional()
  cronExpression?: string | null;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  clientIds?: number[];

  @IsBoolean()
  @IsOptional()
  sendToAllClients?: boolean;

  @IsBoolean()
  @IsOptional()
  includeForm?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDynamicFormDto)
  dynamicForm?: UpdateDynamicFormDto;
}

export class DuplicateTemplateDto {
  @IsString()
  @IsOptional()
  nom?: string;
}

export class TemplateFiltersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @IsBoolean()
  isPeriodic?: boolean;

  @IsOptional()
  @IsBoolean()
  includeForm?: boolean;

  @IsOptional()
  @IsInt()
  page?: number;

  @IsOptional()
  @IsInt()
  limit?: number;
}

export class SendTemplateDto {
  @IsInt()
  templateId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  clientIds?: number[];

  @IsBoolean()
  @IsOptional()
  sendToAllClients?: boolean;
}

export class AssignClientsToTemplateDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayNotEmpty()
  clientIds: number[];
}

export class RemoveClientsFromTemplateDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayNotEmpty()
  clientIds: number[];
}

export class SubmitDynamicFormDto {
  @IsString()
  token: string;

  responses: Record<string, any>;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}