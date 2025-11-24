-- CreateEnum
CREATE TYPE "public"."PeriodeDossier" AS ENUM ('MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL', 'PONCTUEL');

-- CreateEnum
CREATE TYPE "public"."StatusDossier" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'COMPLET', 'VALIDE', 'REFUSE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "public"."StatusDocumentRequest" AS ENUM ('EN_ATTENTE', 'RECU', 'VALIDE', 'REFUSE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "public"."StatusUpload" AS ENUM ('VALIDE', 'EN_REVISION', 'REFUSE', 'REMPLACE');

-- AlterTable
ALTER TABLE "public"."formulaires" ADD COLUMN     "dossierId" INTEGER;

-- CreateTable
CREATE TABLE "public"."dossier_batches" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "periode" TEXT,
    "dateEcheance" TIMESTAMP(3),
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "comptableId" INTEGER NOT NULL,
    "dossierTemplateId" INTEGER,

    CONSTRAINT "dossier_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dossiers" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "periode" TEXT,
    "dateEcheance" TIMESTAMP(3),
    "status" "public"."StatusDossier" NOT NULL DEFAULT 'EN_ATTENTE',
    "pourcentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentsUpload" INTEGER NOT NULL DEFAULT 0,
    "documentsRequis" INTEGER NOT NULL DEFAULT 0,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "dateCompletion" TIMESTAMP(3),
    "clientId" INTEGER NOT NULL,
    "comptableId" INTEGER NOT NULL,
    "dossierTemplateId" INTEGER,
    "dossierBatchId" INTEGER,

    CONSTRAINT "dossiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dossier_templates" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "typeActivite" TEXT,
    "regimeFiscal" TEXT,
    "periode" "public"."PeriodeDossier" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "dossier_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documents_template_requis" (
    "id" SERIAL NOT NULL,
    "dossierTemplateId" INTEGER NOT NULL,
    "typeDocument" "public"."TypeDocument" NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "quantiteMin" INTEGER NOT NULL DEFAULT 1,
    "quantiteMax" INTEGER,
    "formatAccepte" TEXT[],
    "tailleMaxMo" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "documents_template_requis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."document_requests" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "typeDocument" "public"."TypeDocument" NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT true,
    "quantiteMin" INTEGER NOT NULL DEFAULT 1,
    "quantiteMax" INTEGER,
    "formatAccepte" TEXT[],
    "tailleMaxMo" INTEGER NOT NULL DEFAULT 10,
    "status" "public"."StatusDocumentRequest" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEcheance" TIMESTAMP(3),
    "dateCompletion" TIMESTAMP(3),
    "instructions" TEXT,
    "clientId" INTEGER NOT NULL,
    "comptableId" INTEGER NOT NULL,
    "dossierId" INTEGER,
    "formulaireId" INTEGER,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."document_uploads" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "documentRequestId" INTEGER NOT NULL,
    "status" "public"."StatusUpload" NOT NULL DEFAULT 'VALIDE',
    "commentaire" TEXT,
    "dateUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_template_requis_dossierTemplateId_typeDocument_key" ON "public"."documents_template_requis"("dossierTemplateId", "typeDocument");

-- CreateIndex
CREATE UNIQUE INDEX "document_uploads_documentId_documentRequestId_key" ON "public"."document_uploads"("documentId", "documentRequestId");

-- AddForeignKey
ALTER TABLE "public"."dossier_batches" ADD CONSTRAINT "dossier_batches_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dossier_batches" ADD CONSTRAINT "dossier_batches_dossierTemplateId_fkey" FOREIGN KEY ("dossierTemplateId") REFERENCES "public"."dossier_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dossiers" ADD CONSTRAINT "dossiers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dossiers" ADD CONSTRAINT "dossiers_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dossiers" ADD CONSTRAINT "dossiers_dossierTemplateId_fkey" FOREIGN KEY ("dossierTemplateId") REFERENCES "public"."dossier_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dossiers" ADD CONSTRAINT "dossiers_dossierBatchId_fkey" FOREIGN KEY ("dossierBatchId") REFERENCES "public"."dossier_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dossier_templates" ADD CONSTRAINT "dossier_templates_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents_template_requis" ADD CONSTRAINT "documents_template_requis_dossierTemplateId_fkey" FOREIGN KEY ("dossierTemplateId") REFERENCES "public"."dossier_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "public"."dossiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_requests" ADD CONSTRAINT "document_requests_formulaireId_fkey" FOREIGN KEY ("formulaireId") REFERENCES "public"."formulaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_uploads" ADD CONSTRAINT "document_uploads_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_uploads" ADD CONSTRAINT "document_uploads_documentRequestId_fkey" FOREIGN KEY ("documentRequestId") REFERENCES "public"."document_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."formulaires" ADD CONSTRAINT "formulaires_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "public"."dossiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
