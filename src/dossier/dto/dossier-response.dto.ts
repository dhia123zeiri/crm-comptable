import { StatusDossier } from '@prisma/client';

export class DossierBatchResponseDto {
  batchId: number;
  dossiersCreated: number;
  dossiers: DossierSummaryDto[];
}

export class DossierSummaryDto {
  id: number;
  nom: string;
  clientId: number;
  clientName: string;
  status: StatusDossier;
  documentsRequis: number;
}

export class DossierProgressSummaryDto {
  batchId?: number;
  totalDossiers: number;
  completedDossiers: number;
  inProgressDossiers: number;
  pendingDossiers: number;
  overallProgress: number;
  dossiers: DossierProgressDto[];
}

export class DossierProgressDto {
  id: number;
  nom: string;
  clientName: string;
  progress: number;
  documentsUpload: number;
  documentsRequis: number;
  status: StatusDossier;
}

export class ComptableClientDto {
  id: number;
  raisonSociale: string;
  typeActivite?: string;
  regimeFiscal?: string;
  derniereConnexion?: Date;
}

export class DossierTemplateDto {
  id: number;
  nom: string;
  description?: string;
  periode: string;
  actif: boolean;
  documentsRequis: DocumentTemplateRequisDto[];
}

export class DocumentTemplateRequisDto {
  typeDocument: string;
  obligatoire: boolean;
  quantiteMin: number;
  quantiteMax?: number;
  formatAccepte: string[];
  tailleMaxMo: number;
}

export class DossierDetailsDto {
  id: number;
  nom: string;
  description?: string;
  periode?: string;
  dateEcheance?: Date;
  status: StatusDossier;
  pourcentage: number;
  documentsUpload: number;
  documentsRequis: number;
  dateCreation: Date;
  dateModification: Date;
  dateCompletion?: Date;
  client: {
    id: number;
    raisonSociale: string;
    typeActivite?: string;
  };
  dossierBatch?: {
    id: number;
    nom: string;
  };
  documentRequests: DocumentRequestDetailDto[];
}

export class DocumentRequestDetailDto {
  id: number;
  titre: string;
  description?: string;
  typeDocument: string;
  obligatoire: boolean;
  quantiteMin: number;
  quantiteMax?: number;
  formatAccepte: string[];
  tailleMaxMo: number;
  status: string;
  dateCreation: Date;
  dateEcheance?: Date;
  instructions?: string;
  uploads: DocumentUploadDto[];
}

export class DocumentUploadDto {
  id: number;
  status: string;
  commentaire?: string;
  dateUpload: Date;
  dateValidation?: Date;
  document: {
    nom: string;
    nomOriginal: string;
    taille: number;
    dateUpload: Date;
  };
}

export class BatchSummaryDto {
  id: number;
  nom: string;
  description?: string;
  periode?: string;
  dateEcheance?: Date;
  dateCreation: Date;
  dossierTemplate?: {
    nom: string;
  };
  dossiers: BatchDossierDto[];
  summary: {
    totalDossiers: number;
    completedDossiers: number;
    inProgressDossiers: number;
    pendingDossiers: number;
    averageProgress: number;
  };
}

export class BatchDossierDto {
  id: number;
  nom: string;
  client: {
    id: number;
    raisonSociale: string;
  };
  status: StatusDossier;
  progress: number;
  totalRequests: number;
  completedRequests: number;
  dateCreation: Date;
}

export class ComptableStatisticsDto {
  totalDossiers: number;
  completedDossiers: number;
  inProgressDossiers: number;
  pendingDossiers: number;
  totalClients: number;
  completionRate: number;
  recentActivity: RecentActivityDto[];
}

export class RecentActivityDto {
  id: number;
  documentName: string;
  clientName: string;
  status: string;
  dateUpload: Date;
}