/*
  Warnings:

  - The values [TVA,SOCIAL,BILAN,LIASSE_FISCALE,RAPPEL] on the enum `TemplateType` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `templates` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `category` to the `templates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."TemplateType_new" AS ENUM ('REMINDER', 'INVOICE', 'INFO', 'CUSTOM');
ALTER TABLE "public"."templates" ALTER COLUMN "type" TYPE "public"."TemplateType_new" USING ("type"::text::"public"."TemplateType_new");
ALTER TYPE "public"."TemplateType" RENAME TO "TemplateType_old";
ALTER TYPE "public"."TemplateType_new" RENAME TO "TemplateType";
DROP TYPE "public"."TemplateType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."templates" DROP CONSTRAINT "templates_comptableId_fkey";

-- AlterTable
ALTER TABLE "public"."templates" DROP CONSTRAINT "templates_pkey",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "parametres" JSONB,
ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variables" TEXT[],
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "comptableId" DROP NOT NULL,
ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "templates_id_seq";

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
