-- AlterTable
ALTER TABLE "treino_previsto" ADD COLUMN     "importacao_id" UUID;

-- CreateTable
CREATE TABLE "importacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ciclo_id" UUID NOT NULL,
    "nome_arquivo" TEXT,
    "semanas_criadas" INTEGER NOT NULL,
    "treinos_criados" INTEGER NOT NULL,
    "linhas_com_erro" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_previsto" ADD CONSTRAINT "treino_previsto_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
