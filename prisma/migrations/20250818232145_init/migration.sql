-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('DRAFT', 'SENT', 'OPENED', 'CLICKED', 'RESPONDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."TemplateType" AS ENUM ('TVA', 'SOCIAL', 'BILAN', 'LIASSE_FISCALE', 'CUSTOM', 'RAPPEL');

-- CreateEnum
CREATE TYPE "public"."FormulaireStatus" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."TypeDocument" AS ENUM ('FACTURE_VENTE', 'FACTURE_ACHAT', 'RELEVE_BANCAIRE', 'BULLETIN_PAIE', 'JUSTIFICATIF', 'CONTRAT', 'DECLARATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."TypeTache" AS ENUM ('TVA', 'SOCIAL', 'BILAN', 'LIASSE_FISCALE', 'RELANCE_CLIENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."Priorite" AS ENUM ('BASSE', 'MOYENNE', 'HAUTE', 'URGENTE');

-- CreateEnum
CREATE TYPE "public"."StatusTache" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "public"."TypeEcheance" AS ENUM ('TVA_MENSUELLE', 'TVA_TRIMESTRIELLE', 'CHARGES_SOCIALES', 'DECLARATION_ANNUELLE', 'LIASSE_FISCALE', 'AUTRE');

-- CreateEnum
CREATE TYPE "public"."StatusEcheance" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "public"."TypeNotification" AS ENUM ('EMAIL_ENVOYE', 'FORMULAIRE_COMPLETE', 'ECHEANCE_PROCHE', 'TACHE_ASSIGNEE', 'DOCUMENT_RECU', 'RAPPEL', 'ERREUR');

-- CreateEnum
CREATE TYPE "public"."TypeJob" AS ENUM ('ENVOI_EMAIL', 'RAPPEL_ECHEANCE', 'NETTOYAGE_FICHIERS', 'SAUVEGARDE', 'STATISTIQUES');

-- CreateEnum
CREATE TYPE "public"."StatusExecution" AS ENUM ('SUCCESS', 'ERROR', 'WARNING', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "public"."clients" DROP CONSTRAINT "clients_comptableId_fkey";

-- AlterTable
ALTER TABLE "public"."comptables" ALTER COLUMN "specialites" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."emails" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "public"."EmailStatus" NOT NULL DEFAULT 'SENT',
    "templateType" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "clientId" INTEGER NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."templates" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "public"."TemplateType" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."formulaires" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "champs" JSONB NOT NULL,
    "reponses" JSONB,
    "status" "public"."FormulaireStatus" NOT NULL DEFAULT 'PENDING',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateCompletion" TIMESTAMP(3),
    "dateExpiration" TIMESTAMP(3),
    "clientId" INTEGER NOT NULL,
    "emailId" INTEGER,

    CONSTRAINT "formulaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documents" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "nomOriginal" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "typeDocument" "public"."TypeDocument" NOT NULL,
    "typeFichier" TEXT NOT NULL,
    "dateUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "clientId" INTEGER NOT NULL,
    "formulaireId" INTEGER,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."taches" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "type" "public"."TypeTache" NOT NULL,
    "priorite" "public"."Priorite" NOT NULL DEFAULT 'MOYENNE',
    "status" "public"."StatusTache" NOT NULL DEFAULT 'PENDING',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEcheance" TIMESTAMP(3),
    "dateCompletion" TIMESTAMP(3),
    "clientId" INTEGER NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "taches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."echeances" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "type" "public"."TypeEcheance" NOT NULL,
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "dateRappel" TIMESTAMP(3),
    "status" "public"."StatusEcheance" NOT NULL DEFAULT 'ACTIVE',
    "montant" DOUBLE PRECISION,
    "reference" TEXT,
    "clientId" INTEGER NOT NULL,
    "tacheId" INTEGER,

    CONSTRAINT "echeances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "public"."TypeNotification" NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateLecture" TIMESTAMP(3),
    "clientId" INTEGER,
    "comptableId" INTEGER,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."jobs_cron" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "expression" TEXT NOT NULL,
    "type" "public"."TypeJob" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniereExecution" TIMESTAMP(3),
    "prochaineExecution" TIMESTAMP(3),
    "parametres" JSONB,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_cron_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."logs_execution" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "status" "public"."StatusExecution" NOT NULL,
    "message" TEXT,
    "duree" INTEGER,
    "dateExecution" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emails_token_key" ON "public"."emails"("token");

-- AddForeignKey
ALTER TABLE "public"."clients" ADD CONSTRAINT "clients_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emails" ADD CONSTRAINT "emails_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emails" ADD CONSTRAINT "emails_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."formulaires" ADD CONSTRAINT "formulaires_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."formulaires" ADD CONSTRAINT "formulaires_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "public"."emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_formulaireId_fkey" FOREIGN KEY ("formulaireId") REFERENCES "public"."formulaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."taches" ADD CONSTRAINT "taches_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."taches" ADD CONSTRAINT "taches_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."echeances" ADD CONSTRAINT "echeances_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."echeances" ADD CONSTRAINT "echeances_tacheId_fkey" FOREIGN KEY ("tacheId") REFERENCES "public"."taches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."logs_execution" ADD CONSTRAINT "logs_execution_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."jobs_cron"("id") ON DELETE CASCADE ON UPDATE CASCADE;
