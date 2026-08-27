# Corrida App (uso pessoal)

App Android para acompanhar treinos de corrida: plano previsto x realizado (sincronizado do Garmin Connect), organizado em ciclos de preparação para provas.

Uso pessoal, single-user, sem publicação em loja.

**Stack:** React Native (Expo) · NestJS · Prisma · PostgreSQL (Supabase)

## Documentação

A especificação completa do projeto está em [`CLAUDE.md`](./CLAUDE.md) (lida automaticamente pelo Claude Code) e na pasta [`docs/`](./docs):

- [`docs/REQUIREMENTS.md`](./docs/REQUIREMENTS.md) — requisitos funcionais e não funcionais
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) — schema do banco de dados
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitetura, integração Garmin, segurança, CI/CD, dashboards
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — plano de implementação por fases

## Setup

```bash
# Backend
cd backend
cp ../.env.example .env   # preencher com suas credenciais
npm install
npx prisma migrate dev
npm run start:dev

# App
cd app
npm install
npx expo start
```
