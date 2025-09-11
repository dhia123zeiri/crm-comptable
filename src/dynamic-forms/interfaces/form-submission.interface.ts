export interface FormSubmissionDto {
  responses: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}