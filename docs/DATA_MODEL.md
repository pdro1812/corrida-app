# Modelo de Dados

Schema de referência em SQL. Implementar via Prisma (`backend/prisma/schema.prisma`), gerando migrations a partir daqui — este arquivo é a fonte da verdade do modelo, não o schema Prisma em si.

Convenção: nomes de tabelas e colunas em português (snake_case no SQL), mapeados para camelCase nos DTOs/entities do NestJS (`treinoPrevisto`, `paceAlvoMin` etc.), como já é o padrão do Prisma.

```sql
-- Ciclo de preparação (ex: "Meia Maratona - Set/2026")
-- A prova alvo NÃO fica armazenada aqui (ver nota de implementação abaixo)
-- — é a linha de `prova` com tipo='alvo' vinculada a este ciclo.
CREATE TABLE ciclo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status TEXT DEFAULT 'ativo',       -- ativo | concluido | cancelado
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Semana dentro de um ciclo
CREATE TABLE semana (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID REFERENCES ciclo(id) ON DELETE CASCADE,
  numero_semana INT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  fase TEXT,                          -- "1. Base (Adaptação)", "2. Específica 21k"...
  rotina_extra TEXT                   -- "2x 15min Fortalecimento"
  -- km/tempo planejado total: NÃO são colunas — ver nota de implementação abaixo
);

-- Treino previsto. Quantidade por semana é livre (RF06): cada linha tem sua
-- própria data/dia_semana, não há colunas fixas por dia.
CREATE TABLE treino_previsto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id UUID REFERENCES semana(id) ON DELETE CASCADE,
  dia_semana TEXT NOT NULL,
  data DATE NOT NULL,
  tipo TEXT,                          -- rodagem | qualidade | longo | descanso
  descricao TEXT NOT NULL,
  distancia_alvo_km NUMERIC,
  duracao_alvo INTERVAL,
  pace_alvo_min TEXT,                 -- "4:15"
  pace_alvo_max TEXT,                 -- "4:20"
  status TEXT DEFAULT 'pendente',     -- pendente | realizado | nao_realizado | parcial
  motivo_nao_realizado TEXT           -- preenchido quando status = nao_realizado
);

-- Estrutura do treino previsto quando é intervalado ("tiro").
-- Alimenta o gráfico previsto x realizado por repetição (RF22).
CREATE TABLE treino_previsto_intervalo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treino_previsto_id UUID REFERENCES treino_previsto(id) ON DELETE CASCADE,
  ordem INT NOT NULL,
  tipo TEXT NOT NULL,                 -- aquecimento | tiro | recuperacao | desaquecimento
  repeticao_numero INT,               -- número do tiro; NULL para aquecimento/desaquecimento
  distancia_alvo_km NUMERIC,
  duracao_alvo INTERVAL,
  pace_alvo_min TEXT,
  pace_alvo_max TEXT
);

-- Treino realizado (Garmin ou manual)
CREATE TABLE treino_realizado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treino_previsto_id UUID REFERENCES treino_previsto(id),  -- NULL se treino avulso
  garmin_activity_id TEXT UNIQUE,     -- NULL se manual; garante idempotência (RF14)
  fonte TEXT DEFAULT 'garmin',        -- garmin | manual
  data DATE NOT NULL,
  distancia_km NUMERIC,
  duracao INTERVAL,
  pace_medio TEXT,
  fc_media INT,
  fc_max INT,
  elevacao_m NUMERIC,
  -- Feedback estruturado (RF18)
  rpe INT,                            -- percepção de esforço, 1-10
  sensacoes TEXT[],                   -- tags: bem_encaixado | cansado | dor | animado | clima_ruim | teve_que_parar | sub_performou | superou_expectativa
  feedback_texto TEXT,                -- relato livre
  observacoes TEXT,                   -- observações técnicas (distinto do feedback subjetivo)
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Splits do treino realizado, vindos do Garmin (tela "Intervals" do app Garmin)
CREATE TABLE treino_realizado_intervalo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treino_realizado_id UUID REFERENCES treino_realizado(id) ON DELETE CASCADE,
  ordem INT NOT NULL,
  tipo TEXT NOT NULL,                 -- warmup | run | recovery | cooldown (nomenclatura do Garmin)
  repeticao_numero INT,               -- casa com treino_previsto_intervalo.repeticao_numero
  tempo INTERVAL,
  distancia_km NUMERIC,
  pace_medio TEXT,
  fc_media INT
);

-- Provas dentro de um ciclo: uma alvo + N secundárias (RF02)
CREATE TABLE prova (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID REFERENCES ciclo(id),
  tipo TEXT DEFAULT 'alvo',           -- alvo | secundaria
  nome TEXT NOT NULL,
  data DATE NOT NULL,
  distancia_km NUMERIC,
  meta_tempo INTERVAL,
  resultado_tempo INTERVAL,
  resultado_pace TEXT,
  concluida BOOLEAN DEFAULT false
);

-- Cache do token OAuth2 do Strava (integração exploratória, ver
-- ARCHITECTURE.md §3.4) — linha única (id fixo em 1). O Strava usa
-- OAuth2 padrão: access_token expira em ~6h e é renovado via
-- refresh_token (que também rotaciona a cada renovação).
CREATE TABLE strava_sessao (
  id INT PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);
```

## Notas de implementação

- **Total km / tempo total da semana** (colunas da planilha original) são **calculados** a partir de `treino_realizado`/`treino_previsto`, nunca armazenados — evita dessincronização. Por isso `km_planejado_total`/`tempo_planejado_total` **não existem** como colunas em `semana` no `schema.prisma` (o bloco SQL acima já reflete isso); quem consulta a semana recebe os totais calculados na resposta da API, somando `distancia_alvo_km`/`duracao_alvo_segundos` dos `treino_previsto` vinculados.
- **Matching previsto↔realizado** (RF15): ao inserir um `treino_realizado` vindo do Garmin, buscar o `treino_previsto` da mesma `data` (± 1 dia) mais próximo; se achar, setar o vínculo e `status = 'realizado'`. `treino_previsto_id` **não é `UNIQUE`** de propósito: um previsto pode acumular mais de um `treino_realizado` — é o caso comum de o Garmin registrar o mesmo treino como duas atividades separadas (ex: esqueceu de retomar o cronômetro no meio do treino). Nesse cenário, a segunda atividade casa com o mesmo previsto da primeira em vez de ficar órfã ou "roubar" outro previsto vizinho. A agregação (soma de distância/duração, pace médio ponderado) é feita em tempo de consulta pelo app (`agregarRealizados` em `app/src/utils/comparacao.ts`), nunca armazenada.
- **Matching de intervalos** (RF22): convivem dois formatos de `treino_realizado_intervalo.tipo` no banco. **(a) Sync pela Personal API (nov/2026 em diante):** os laps vêm do arquivo FIT, cujo campo `intensity` distingue tiro de trote em treinos estruturados no relógio — `active`/`interval` → `run`, `rest`/`recovery` → `recovery`, `warmup`/`cooldown` iguais. Como o mapper (`mapearSplitsParaIntervalos`) só incrementa `repeticao_numero` em `run` e repete o número no `recovery` seguinte, os tiros ficam numerados 1..N, alinhados com `treino_previsto_intervalo.repeticao_numero`. Validado contra o FIT real do 10x400m de 22/08: aquecimento + 10 `active` de 400m + 10 `recovery` de 60s + desaquecimento. **(b) Sync antigo (endpoint JSON de splits, até out/2026):** `intensityType` só vinha como `WARMUP`/`ACTIVE`/`COOLDOWN` (nunca `REST`), então todo lap do meio chegava como `run`, com `repeticao_numero` sequencial contando tiro+trote juntos. `montarComparacaoTiros` (`app/src/utils/comparacaoTiro.ts`) trata os dois: se houver algum lap `recovery`, usa o tipo explícito (tiro = `run`, trote = `recovery`); senão cai na heurística de alternância por posição dentro dos laps `run` (ímpar = tiro, par = trote, sempre começando pelo tiro). Quando há mais de um `treino_realizado` vinculado ao previsto, os intervalos de todos eles são combinados (ordenados por `ordem`) antes desse casamento.
- **Tags de sensação**: lista inicial em `sensacoes` é um ponto de partida — não travar como enum rígido no banco (usar `TEXT[]` como no schema), para não exigir migration toda vez que uma tag nova for adicionada.
- **Campos `INTERVAL`**: o Prisma não tem tipo nativo para `INTERVAL` do Postgres. Decisão tomada na Fase 0/1: todos os campos `INTERVAL` deste documento (`meta_tempo`, `tempo_planejado_total`, `duracao_alvo`, `duracao`, `tempo`) viram `INT` (segundos) no `schema.prisma` real, com sufixo `_segundos` na coluna (ex: `duracao_alvo_segundos`). Este documento continua descrevendo o modelo conceitual; o schema Prisma é a fonte da verdade do tipo físico da coluna.
- **`garmin_sessao` (removida em nov/2026):** cacheava o token da lib Python não-oficial. Com a Garmin Personal API o access token vive só em memória no `GarminService` (ver `ARCHITECTURE.md` §3.1), então a tabela foi dropada (migration `remove_garmin_sessao`).
- **Ciclo não guarda a prova alvo diretamente** (decisão tomada após feedback do dono do projeto, migration `ciclo_usa_prova_relacionada`): a primeira versão tinha `prova_alvo`/`data_prova`/`meta_tempo`/`distancia_prova_km` como colunas soltas em `ciclo`, duplicando (e podendo dessincronizar de) a tabela `prova`. Agora `ciclo` só tem `nome`/`data_inicio`/`data_fim`/`status`; a prova alvo é a linha de `prova` com `tipo = 'alvo'` vinculada ao ciclo (`prova.ciclo_id`), criada junto com o ciclo na mesma operação. Regras de negócio: cada ciclo tem exatamente uma prova `alvo` (criada no `POST /ciclos`, editada via `PATCH /ciclos/:id` — nunca diretamente em `POST /ciclos/:id/provas`, que só aceita `secundaria`) e ela não pode ser excluída via `DELETE /provas/:id`. A contagem regressiva (RF21) e o nome/distância exibidos no dashboard (RF19-21) sempre lêem dessa prova alvo, nunca de um campo solto no ciclo.
