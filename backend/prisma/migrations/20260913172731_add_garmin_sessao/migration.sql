-- CreateTable
CREATE TABLE "garmin_sessao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "token_store" TEXT NOT NULL,
    "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garmin_sessao_pkey" PRIMARY KEY ("id")
);
