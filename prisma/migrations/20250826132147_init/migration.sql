/*
  Warnings:

  - You are about to drop the column `emailId` on the `formulaires` table. All the data in the column will be lost.
  - You are about to drop the `emails` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `comptableId` on table `templates` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "public"."TypeJob" ADD VALUE 'ENVOI_EMAIL_TEMPLATE';

-- DropForeignKey
ALTER TABLE "public"."emails" DROP CONSTRAINT "emails_clientId_fkey";

-- DropForeignKey
ALTER TABLE "public"."emails" DROP CONSTRAINT "emails_comptableId_fkey";

-- DropForeignKey
ALTER TABLE "public"."formulaires" DROP CONSTRAINT "formulaires_emailId_fkey";

-- DropForeignKey
ALTER TABLE "public"."templates" DROP CONSTRAINT "templates_comptableId_fkey";

-- AlterTable
ALTER TABLE "public"."formulaires" DROP COLUMN "emailId",
ADD COLUMN     "emailLogId" INTEGER;

-- AlterTable
ALTER TABLE "public"."templates" ADD COLUMN     "cronExpression" TEXT,
ADD COLUMN     "isPeriodic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastExecutionAt" TIMESTAMP(3),
ADD COLUMN     "nextExecutionAt" TIMESTAMP(3),
ALTER COLUMN "comptableId" SET NOT NULL;

-- DropTable
DROP TABLE "public"."emails";

-- CreateTable
CREATE TABLE "public"."template_clients" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "dateAssignation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "template_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_logs" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "public"."EmailStatus" NOT NULL DEFAULT 'SENT',
    "messageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "templateId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "template_clients_templateId_clientId_key" ON "public"."template_clients"("templateId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_token_key" ON "public"."email_logs"("token");

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."template_clients" ADD CONSTRAINT "template_clients_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."template_clients" ADD CONSTRAINT "template_clients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_logs" ADD CONSTRAINT "email_logs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_logs" ADD CONSTRAINT "email_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."formulaires" ADD CONSTRAINT "formulaires_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "public"."email_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
