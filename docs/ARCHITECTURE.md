# Arquitetura

## 1. Visão geral

```
┌─────────────────────┐        ┌────────────────────────┐        ┌──────────────────┐
│  App Android (Expo)  │ HTTPS  │  Backend (NestJS)        │  HTTPS │  Garmin Connect    │
│  React Native          │◄──────►│  Railway ou Render         │◄──────►│  (lib não-oficial)  │
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

- A API **oficial** (Garmin Connect Developer Program) só é liberada para empresas parceiras aprovadas — não existe caminho de acesso individual via conta de desenvolvedor.
- Caminho usado para uso pessoal: lib **não-oficial** que autentica com e-mail/senha do Garmin Connect. Funciona como login normal do app oficial, mas é automatizado.
- Isso está fora dos Termos de Uso do Garmin (acesso automatizado), embora seja um padrão amplamente usado por projetos pessoais. Risco real é baixo; pior cenário comum é a lib quebrar após mudança no site da Garmin, exigindo update de dependência — não banimento de conta.
- Decisão do projeto: aceitar esse risco (RNF05), mitigando com sincronização limitada a 1x/dia + trigger manual, nunca polling agressivo.
- **Implementação (set/2026):** as libs Node não-oficiais (`garmin-connect`, `@gooin/garmin-connect`) pararam de conseguir autenticar depois de uma mudança no fluxo de login do Garmin. A lib Python `garminconnect` (cyberjunky/python-garminconnect, mantida ativamente) já foi corrigida para o novo fluxo — validada manualmente contra a conta real. Por isso `GarminService` delega a autenticação a um subprocesso Python (`backend/garmin_client/session.py`, `backend/requirements.txt`), mantido vivo por sessão e conversando com o Nest via stdin/stdout (uma linha JSON por comando/resposta). A venv é criada automaticamente no `postinstall` do backend (`backend/package.json`), então roda no mesmo serviço do Render sem precisar de uma segunda aplicação — se a preparação do Python falhar no build, a sincronização Garmin fica indisponível (erro tratado, RNF12) mas o resto do backend continua funcionando normalmente.

### 3.2 Fluxo de sincronização

1. Credenciais Garmin (`GARMIN_EMAIL`, `GARMIN_PASSWORD`) apenas em variável de ambiente — nunca no código, nunca no banco em texto puro.
2. Job `@Cron(process.env.GARMIN_SYNC_CRON)` — padrão `0 7 * * *` (7h, configurável) — chama `GarminService`, que busca atividades novas via o subprocesso Python (ver §3.1) desde a última sincronização.
3. Para cada atividade de corrida: extrai data, distância, duração, pace médio, FC média/máxima, elevação, `activityId` (chave de idempotência, RF14).
4. Busca também os splits da atividade (`getActivitySplits` ou equivalente) → popula `treino_realizado_intervalo` (dados equivalentes à tela "Intervals" do app Garmin: Warm Up, Run, Recovery...).
5. Salva `treino_realizado`, tenta casar com `treino_previsto` da mesma data (RF15, regra em `DATA_MODEL.md`).
6. Endpoint `POST /sync/garmin` permite disparo manual (RF11) — vira botão "Sincronizar agora" no app.

### 3.3 Tolerância a falha (RNF12)

Se a lib não-oficial parar de funcionar, o resto do app (planejamento, dashboards, registro manual) continua operando normalmente. Falha de sync não deve derrubar nenhuma outra rota — isolar chamadas Garmin em try/catch dedicado, logar erro, não propagar exceção não tratada.

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
| Credenciais Garmin | Só em env vars (Railway/Render + Supabase Vault). `.env` sempre no `.gitignore`. |
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
│   │   ├── garmin/                # GarminService (subprocesso Python) + cron
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
