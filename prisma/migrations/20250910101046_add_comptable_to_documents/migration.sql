/*
  Warnings:

  - Added the required column `comptableId` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."documents" ADD COLUMN     "comptableId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
