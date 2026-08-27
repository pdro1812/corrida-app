/*
  Warnings:

  - You are about to drop the column `km_planejado_total` on the `semana` table. All the data in the column will be lost.
  - You are about to drop the column `tempo_planejado_total_segundos` on the `semana` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "semana" DROP COLUMN "km_planejado_total",
DROP COLUMN "tempo_planejado_total_segundos";
