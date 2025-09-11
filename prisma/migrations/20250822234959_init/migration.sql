/*
  Warnings:

  - You are about to drop the column `parametres` on the `templates` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."templates" DROP COLUMN "parametres",
ADD COLUMN     "variables" TEXT[];
