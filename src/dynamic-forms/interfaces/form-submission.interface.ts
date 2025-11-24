// src/dynamic-forms/interfaces/form-submission.interface.ts
export interface FormSubmissionDto {
  responses: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  files?: Record<string, Express.Multer.File[]>; // Ajout pour les fichiers uploadés
}

export interface FileMetadata {
  fieldLabel: string;
  originalName: string;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
}