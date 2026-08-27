/*
  Warnings:

  - You are about to drop the column `data_prova` on the `ciclo` table. All the data in the column will be lost.
  - You are about to drop the column `distancia_prova_km` on the `ciclo` table. All the data in the column will be lost.
  - You are about to drop the column `meta_tempo_segundos` on the `ciclo` table. All the data in the column will be lost.
  - You are about to drop the column `prova_alvo` on the `ciclo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ciclo" DROP COLUMN "data_prova",
DROP COLUMN "distancia_prova_km",
DROP COLUMN "meta_tempo_segundos",
DROP COLUMN "prova_alvo";
