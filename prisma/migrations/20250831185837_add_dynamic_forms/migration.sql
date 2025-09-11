-- CreateEnum
CREATE TYPE "public"."FormResponseStatus" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."templates" ADD COLUMN     "dynamicFormId" INTEGER,
ADD COLUMN     "includeForm" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."dynamic_forms" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "expirationDays" INTEGER NOT NULL DEFAULT 30,
    "requiresAuthentication" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "dynamic_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dynamic_form_responses" (
    "id" SERIAL NOT NULL,
    "responses" JSONB NOT NULL,
    "status" "public"."FormResponseStatus" NOT NULL DEFAULT 'PENDING',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateCompletion" TIMESTAMP(3),
    "dateExpiration" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clientId" INTEGER NOT NULL,
    "dynamicFormId" INTEGER NOT NULL,
    "emailLogId" INTEGER,

    CONSTRAINT "dynamic_form_responses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_dynamicFormId_fkey" FOREIGN KEY ("dynamicFormId") REFERENCES "public"."dynamic_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dynamic_forms" ADD CONSTRAINT "dynamic_forms_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dynamic_form_responses" ADD CONSTRAINT "dynamic_form_responses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dynamic_form_responses" ADD CONSTRAINT "dynamic_form_responses_dynamicFormId_fkey" FOREIGN KEY ("dynamicFormId") REFERENCES "public"."dynamic_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dynamic_form_responses" ADD CONSTRAINT "dynamic_form_responses_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "public"."email_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
