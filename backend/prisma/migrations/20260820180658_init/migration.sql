-- CreateTable
CREATE TABLE "ciclo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "prova_alvo" TEXT,
    "data_prova" DATE,
    "meta_tempo_segundos" INTEGER,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "distancia_prova_km" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semana" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ciclo_id" UUID NOT NULL,
    "numero_semana" INTEGER NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "fase" TEXT,
    "km_planejado_total" DECIMAL,
    "tempo_planejado_total_segundos" INTEGER,
    "rotina_extra" TEXT,

    CONSTRAINT "semana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treino_previsto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "semana_id" UUID NOT NULL,
    "dia_semana" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" TEXT,
    "descricao" TEXT NOT NULL,
    "distancia_alvo_km" DECIMAL,
    "duracao_alvo_segundos" INTEGER,
    "pace_alvo_min" TEXT,
    "pace_alvo_max" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo_nao_realizado" TEXT,

    CONSTRAINT "treino_previsto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treino_previsto_intervalo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treino_previsto_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "repeticao_numero" INTEGER,
    "distancia_alvo_km" DECIMAL,
    "duracao_alvo_segundos" INTEGER,
    "pace_alvo_min" TEXT,
    "pace_alvo_max" TEXT,

    CONSTRAINT "treino_previsto_intervalo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treino_realizado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treino_previsto_id" UUID,
    "garmin_activity_id" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'garmin',
    "data" DATE NOT NULL,
    "distancia_km" DECIMAL,
    "duracao_segundos" INTEGER,
    "pace_medio" TEXT,
    "fc_media" INTEGER,
    "fc_max" INTEGER,
    "elevacao_m" DECIMAL,
    "rpe" INTEGER,
    "sensacoes" TEXT[],
    "feedback_texto" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treino_realizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treino_realizado_intervalo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treino_realizado_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "repeticao_numero" INTEGER,
    "tempo_segundos" INTEGER,
    "distancia_km" DECIMAL,
    "pace_medio" TEXT,
    "fc_media" INTEGER,

    CONSTRAINT "treino_realizado_intervalo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prova" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ciclo_id" UUID,
    "tipo" TEXT NOT NULL DEFAULT 'alvo',
    "nome" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "distancia_km" DECIMAL,
    "meta_tempo_segundos" INTEGER,
    "resultado_tempo_segundos" INTEGER,
    "resultado_pace" TEXT,
    "concluida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "prova_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treino_previsto_data_idx" ON "treino_previsto"("data");

-- CreateIndex
CREATE UNIQUE INDEX "treino_realizado_garmin_activity_id_key" ON "treino_realizado"("garmin_activity_id");

-- CreateIndex
CREATE INDEX "treino_realizado_data_idx" ON "treino_realizado"("data");

-- AddForeignKey
ALTER TABLE "semana" ADD CONSTRAINT "semana_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_previsto" ADD CONSTRAINT "treino_previsto_semana_id_fkey" FOREIGN KEY ("semana_id") REFERENCES "semana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_previsto_intervalo" ADD CONSTRAINT "treino_previsto_intervalo_treino_previsto_id_fkey" FOREIGN KEY ("treino_previsto_id") REFERENCES "treino_previsto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_realizado" ADD CONSTRAINT "treino_realizado_treino_previsto_id_fkey" FOREIGN KEY ("treino_previsto_id") REFERENCES "treino_previsto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treino_realizado_intervalo" ADD CONSTRAINT "treino_realizado_intervalo_treino_realizado_id_fkey" FOREIGN KEY ("treino_realizado_id") REFERENCES "treino_realizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prova" ADD CONSTRAINT "prova_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
