-- DropForeignKey
ALTER TABLE "public"."clients" DROP CONSTRAINT "clients_comptableId_fkey";

-- AlterTable
ALTER TABLE "public"."comptables" ALTER COLUMN "specialites" SET DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "public"."clients" ADD CONSTRAINT "clients_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "public"."comptables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
