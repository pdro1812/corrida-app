# Arquitetura

## 1. Visão geral

```
┌─────────────────────┐        ┌────────────────────────┐        ┌──────────────────┐
│  App Android (Expo)  │ HTTPS  │  Backend (NestJS)        │  HTTPS │  Garmin Connect    │
│  React Native          │◄──────►│  Railway ou Render         │◄──────►│  (Personal API)     │
└─────────────────────┘        │  + cron @nestjs/schedule   │        └──────────────────┘
                                 └─────────────┬──────────────┘
                                                │
                                       ┌────────▼─────────┐
                                       │ PostgreSQL (Supabase) │
                                       └────────────────────┘
```

## 2. Componentes

| Componente | Tecnologia | Onde roda |
|---|---|---|
| App mobile | React Native + Expo (TypeScript) | Android do usuário |
| API Backend | NestJS (TypeScript) | Railway ou Render (free tier) |
| ORM | Prisma | — |
| Banco | PostgreSQL | Supabase (free tier) |
| Sync Garmin | `@nestjs/schedule` (`@Cron`) | Mesmo backend |
| Autenticação app↔backend | API key fixa (RNF03) | — |
| CI/CD | GitHub Actions | GitHub |
| Build do APK | EAS Build (Expo) | Nuvem Expo (free tier) |

Backend é obrigatório (não dá para fazer "tudo local no celular") porque a integração Garmin precisa rodar server-side — ver §3. Como já existe, ele também centraliza o banco: trocar de celular ou reinstalar o app não perde dados.

## 3. Integração com Garmin

### 3.1 Contexto (importante para não reinventar a abordagem)

- **Garmin Connect Personal API (nov/2026 em diante):** programa oficial da Garmin para um usuário acessar os próprios dados, sem aprovação empresarial (diferente do Garmin Connect Developer Program, que continua fora de escopo). A chave é gerada pelo próprio dono em `connect.garmin.com/app/settings/personalApiToken` (validade escolhida na criação: 30/90/180 dias ou 1 ano; a Garmin manda e-mail ~1 semana antes de expirar — **renovar manualmente e atualizar `GARMIN_API_KEY`**). Docs: `developer.garmin.com/gc-developer-program/personal/personal-api`; client Python oficial de referência: `github.com/garmin/connect-personal-api-python`.
- **Autenticação:** `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` com header `Authorization: ApiKey <GARMIN_API_KEY>` devolve o access token (JWT em texto puro, não JSON; validade ~24h pelo claim `exp`; sem refresh token — basta pedir outro). Chamadas de dados usam `Authorization: Bearer <token>`. `GarminService` guarda o token só em memória e renova quando falta menos de 1h para expirar ou após um 401 — como o sync roda 1x/dia, não precisa persistir nada no banco.
- **Endpoints usados** (base `https://personal.connectapi.garmin.com`):
  - `GET /activitylist-service/activities/search/activities?start=0&limit=20` — lista de atividades com todos os campos de `treino_realizado` (`activityId`, `startTimeLocal`, `distance`, `duration`, `averageSpeed`, `averageHR`, `maxHR`, `elevationGain`, `lapCount`, `activityType.typeKey`). Aceita também `startDate`/`endDate` (YYYY-MM-DD).
  - `GET /download-service/files/activity/{id}` com `Accept: application/zip, application/x-zip-compressed, application/octet-stream` (só `application/zip` dá 406) — ZIP com o arquivo FIT original. **Os laps só existem aqui:** os endpoints JSON de splits (`/activity-service/activity/{id}/splits`, `/typedsplits`, `/split_summaries`) respondem 404 nessa API. O FIT é lido com o SDK oficial `@garmin/fitsdk` (`backend/src/garmin/garmin-fit.ts`).
- **Ganho em relação ao FIT:** o campo `intensity` de cada lap distingue tiro (`active`) de trote (`recovery`) em treinos estruturados no relógio — o endpoint JSON antigo nunca marcava REST. Ver nota de matching de intervalos em `DATA_MODEL.md`.
- **Histórico:** até out/2026 o sync usava a lib **não-oficial** Python `garminconnect` (login com e-mail/senha, subprocesso persistente + cache de token na tabela `garmin_sessao`), fora dos Termos de Uso e sujeita a quebrar a cada mudança no login do Garmin — já tinha causado rate limit 429 no SSO em produção (2026-09-13). Tudo isso foi removido na troca para a Personal API (migration `remove_garmin_sessao`).
- Decisão do projeto mantida (RNF05): sincronização limitada a 1x/dia + trigger manual, nunca polling agressivo. A Personal API não documenta rate limit.

### 3.2 Fluxo de sincronização

1. Chave da Personal API (`GARMIN_API_KEY`) apenas em variável de ambiente — nunca no código, nunca no banco, nunca logada.
2. Job `@Cron(process.env.GARMIN_SYNC_CRON)` — padrão `0 7 * * *` (7h, configurável) — chama `GarminService`, que busca atividades novas pela Personal API (ver §3.1).
3. Para cada atividade de corrida: extrai data, distância, duração, pace médio, FC média/máxima, elevação, `activityId` (chave de idempotência, RF14).
4. Para atividades com mais de 1 lap, baixa o arquivo FIT e extrai os laps → popula `treino_realizado_intervalo` (dados equivalentes à tela "Intervals" do app Garmin: Warm Up, Run, Recovery...). Falha em uma atividade específica não aborta o sync — ela entra sem intervalos.
5. Salva `treino_realizado`, tenta casar com `treino_previsto` da mesma data (RF15, regra em `DATA_MODEL.md`).
6. Endpoint `POST /sync/garmin` permite disparo manual (RF11) — vira botão "Sincronizar agora" no app.

### 3.3 Tolerância a falha (RNF12)

Se a Personal API ficar indisponível ou a chave expirar, o resto do app (planejamento, dashboards, registro manual) continua operando normalmente. Falha de sync não deve derrubar nenhuma outra rota — isolar chamadas Garmin em try/catch dedicado, logar erro, não propagar exceção não tratada.

### 3.4 Integração exploratória com Strava (fora do escopo original da V1)

- **Contexto:** pedido do dono do projeto em 2026-09-20, fora de `REQUIREMENTS.md`. Objetivo inicial é só trazer a última atividade do Strava para avaliar se vale a pena evoluir — **não** integra com `treino_previsto`/`treino_realizado` (RF15) nem participa do matching/dashboards ainda. Se evoluir, isso vira uma decisão separada (schema, RF novo).
- **Autenticação:** diferente do Garmin (chave fixa da Personal API), o Strava só expõe OAuth2 padrão. Fluxo de setup único: o dono cria um app em `strava.com/settings/api` (Client ID/Secret, `Authorization Callback Domain = localhost`), autoriza uma vez pelo navegador (`GET /strava/autorizar` devolve a URL de autorização) e cola o `code` retornado em `POST /strava/token`, que troca por `access_token`/`refresh_token`.
- **Renovação:** `access_token` expira em ~6h; `StravaService` renova via `refresh_token` automaticamente quando expirado (o Strava rotaciona o `refresh_token` a cada renovação, então o valor salvo sempre precisa refletir o mais recente).
- **Persistência:** `strava_sessao` (tabela única, `id` fixo), linha única com `id` fixo — necessário porque o filesystem do Render é efêmero entre deploys/restarts.
- **Credenciais:** `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` só em variável de ambiente, nunca no código nem logado (mesma regra de RNF04, embora Strava não esteja formalmente nas RNFs ainda).
- **Endpoint exploratório:** `GET /strava/ultima-atividade` busca a atividade mais recente (`GET /athlete/activities?per_page=1`) e complementa com o detalhe completo (`GET /activities/:id`) para trazer o máximo de campos disponíveis (splits, laps, segment efforts, gear etc.), sem persistir nada no banco — é só leitura/exploração por enquanto.

## 4. Import de planilha (RF05)

Endpoint `POST /ciclos/:id/import-planilha` recebe CSV no formato "longo" (uma linha por treino):

```csv
semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
1,2026-07-07,terca,1. Base (Adaptação),rodagem,45 min Leve,,5:15,5:30
1,2026-07-09,quinta,1. Base (Adaptação),qualidade,"2km Leve + 6x 1km (90s trote) + 1km Leve",,4:15,4:20
1,2026-07-12,domingo,1. Base (Adaptação),longo,13km Leve,13,5:10,5:25
```

Popula `semana` + `treino_previsto` automaticamente. Para treinos intervalados, o parser precisa também gerar as linhas de `treino_previsto_intervalo` (RF08) — a descrição em texto livre ("6x 1km/90s trote") deve ser estruturada nesse momento do import.

## 5. Segurança

| Item | Prática |
|---|---|
| Credenciais Garmin | `GARMIN_API_KEY` só em env vars (Railway/Render). `.env` sempre no `.gitignore`. |
| Comunicação | HTTPS obrigatório (TLS automático nos provedores). |
| Autenticação API | Guard NestJS validando header `Authorization: Bearer <API_KEY>` em toda rota exceto `/health`. |
| Banco | Row Level Security ativado no Supabase mesmo com 1 usuário (custo zero, boa prática). |
| Repositório | Se público no GitHub: `.env.example` sem valores reais; `gitleaks` no CI (§6) para checar segredo vazado. |
| Backup | Backup automático do Supabase free tier + export manual (`pg_dump`) periódico. |
| Rate limit Garmin | Sync limitado a poucas execuções/dia (§3.1). |

## 6. CI/CD

Dois workflows GitHub Actions, cada um só dispara se o path correspondente mudou.

### `.github/workflows/backend.yml`

```yaml
name: Backend CI/CD
on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: backend
      - run: npm run lint
        working-directory: backend
      - run: npm run test
        working-directory: backend
      - run: npm run build
        working-directory: backend
      - name: Rodar migrations (Prisma)
        run: npx prisma migrate deploy
        working-directory: backend
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Scan de segredos vazados
        uses: gitleaks/gitleaks-action@v2
      - name: Deploy no Railway
        run: railway up --service backend
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### `.github/workflows/app.yml`

```yaml
name: App Build
on:
  push:
    branches: [main]
    paths: ['app/**']
  workflow_dispatch: {}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: app
      - run: npm run lint
        working-directory: app
      - name: EAS Build (Android APK)
        run: npx eas-cli build --platform android --profile preview --non-interactive
        working-directory: app
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

APK gerado via EAS Build (perfil "preview") — instalação direta no celular, sem Play Store. Fluxo: merge na `main` → lint/testes/build → migrations → deploy backend automático; app gera novo APK se `app/**` mudou (ou disparo manual via `workflow_dispatch`).

Propositalmente sem staging, sem aprovação manual, sem E2E — adequado para projeto de 1 usuário.

## 7. Estrutura de pastas

```
corrida-app/
├── CLAUDE.md
├── README.md
├── .env.example
├── package.json              # workspaces (app + backend)
├── .gitignore
│
├── app/                       # React Native (Expo)
│   ├── src/
│   │   ├── screens/            # Home, Semana, Progresso, DetalheTiro, Historico
│   │   ├── components/
│   │   ├── services/            # cliente HTTP do backend
│   │   ├── types/
│   │   └── utils/
│   ├── app.json
│   └── package.json
│
├── backend/                   # NestJS
│   ├── src/
│   │   ├── ciclos/              # controller + service + dto
│   │   ├── semanas/
│   │   ├── treinos/              # treino_previsto + treino_realizado + intervalos
│   │   ├── provas/
│   │   ├── garmin/                # GarminService (Personal API + leitura de FIT)
│   │   ├── import/                # parser CSV/JSON
│   │   ├── auth/                  # guard de API key
│   │   ├── prisma/                # PrismaService + schema.prisma
│   │   └── main.ts
│   ├── .env.example
│   └── package.json
│
├── .github/workflows/
│   ├── backend.yml
│   └── app.yml
│
└── docs/
    ├── REQUIREMENTS.md
    ├── DATA_MODEL.md
    ├── ARCHITECTURE.md
    └── IMPLEMENTATION_PLAN.md
```

## 8. Dashboards / Telas principais

1. **Home / Ciclo Ativo** — contagem regressiva pra prova, barra de progresso km feitos/planejados, km faltando, aderência da semana atual.
2. **Semana** — treinos da semana (quantidade variável), previsto x realizado, ícone de status (✅ dentro da meta / ⚠️ fora da meta / ❌ não realizado).
3. **Progresso do Ciclo** — gráfico de barras km planejado x realizado por semana, linha de tendência de pace.
4. **Histórico de Ciclos** — lista de preparações passadas e resultado de cada prova.
5. **Detalhe do Treino de Tiro** (RF22) — gráfico de barras agrupadas: pace planejado x real por repetição; lista de aquecimento/tiros/recuperações com destaque quando fora da meta; resumo "N/M tiros dentro da meta".

## 9. Decisões em aberto (baixa prioridade, não bloqueiam a V1)

- Nome do app / identidade visual (ícone, cores).
- Versão web do backend, caso um dia seja útil ver os dados fora do celular — ao desenhar a API, evitar acoplar demais na tela do app para não fechar essa porta.
- Lista final de tags de `sensacoes` (feedback) — a lista em `DATA_MODEL.md` é ponto de partida, ajustar com o uso.
