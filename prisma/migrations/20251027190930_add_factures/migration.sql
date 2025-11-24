-- CreateEnum
CREATE TYPE "StatusFacture" AS ENUM ('BROUILLON', 'VALIDEE', 'ENVOYEE', 'PAYEE', 'ANNULEE', 'EN_RETARD');

-- CreateTable
CREATE TABLE "factures" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "status" "StatusFacture" NOT NULL DEFAULT 'BROUILLON',
    "notes" TEXT,
    "totalHT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTTC" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "dateValidation" TIMESTAMP(3),
    "dateEnvoi" TIMESTAMP(3),
    "datePaiement" TIMESTAMP(3),
    "clientId" INTEGER NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_factures" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DOUBLE PRECISION NOT NULL,
    "tauxTVA" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "montantHT" DOUBLE PRECISION NOT NULL,
    "montantTVA" DOUBLE PRECISION NOT NULL,
    "montantTTC" DOUBLE PRECISION NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "factureId" INTEGER NOT NULL,

    CONSTRAINT "lignes_factures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_comptableId_fkey" FOREIGN KEY ("comptableId") REFERENCES "comptables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_factures" ADD CONSTRAINT "lignes_factures_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
