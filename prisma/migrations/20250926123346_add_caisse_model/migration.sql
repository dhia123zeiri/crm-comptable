-- CreateTable
CREATE TABLE "public"."caisses" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL,
    "clientId" INTEGER NOT NULL,
    "comptableId" INTEGER NOT NULL,

    CONSTRAINT "caisses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caisses_clientId_nom_key" ON "public"."caisses"("clientId", "nom");

-- AddForeignKey
ALTER TABLE "public"."caisses" ADD CONSTRAINT "caisses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
