-- AlterTable
ALTER TABLE "dynamic_form_responses" ADD COLUMN     "dateRead" TIMESTAMP(3),
ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;
