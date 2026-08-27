# CLAUDE.md

Instruções de projeto para o Claude Code. Leia este arquivo sempre. Os documentos em `docs/` só precisam ser lidos quando a tarefa exigir aquele detalhe — não carregue tudo de uma vez, referencie sob demanda.

## O que é este projeto

App Android **pessoal** (single-user) para acompanhar treinos de corrida: guarda o plano de treino previsto, sincroniza automaticamente os treinos realizados do Garmin Connect, compara previsto x realizado, organiza tudo em ciclos de preparação para provas (com fases, provas secundárias, e treinos de tiro/intervalado).

Uso 100% pessoal. Não haverá outros usuários, não vai para a Play Store, não precisa escalar.

## Stack

| Camada | Tecnologia |
|---|---|
| App | React Native + Expo, TypeScript |
| Backend | NestJS, TypeScript |
| ORM | Prisma |
| Banco | PostgreSQL (Supabase) |
| Integração externa | Garmin Connect via lib não-oficial `garmin-connect` (npm) — ver `docs/ARCHITECTURE.md` §3 |
| Sync | `@nestjs/schedule` (cron 1x/dia, configurável + trigger manual) |
| Infra | Backend no Railway ou Render, build do APK via EAS Build |
| CI/CD | GitHub Actions — ver `docs/ARCHITECTURE.md` §6 |

## Estrutura do monorepo

```
app/        React Native (Expo)
backend/    NestJS — módulos: ciclos, semanas, treinos, provas, garmin, import, auth, prisma
docs/       especificação completa (ler sob demanda, ver abaixo)
```

## Documentos de referência (ler conforme a tarefa)

| Documento | Quando ler |
|---|---|
| `docs/REQUIREMENTS.md` | **Antes de implementar qualquer feature nova.** Lista todos os RF (requisitos funcionais) e RNF (não funcionais). Cada feature deve mapear para um RF. |
| `docs/DATA_MODEL.md` | **Antes de mexer no Prisma schema** ou em qualquer módulo que toque no banco. Schema completo com comentários. |
| `docs/ARCHITECTURE.md` | Para decisões de infraestrutura, integração Garmin, segurança, CI/CD, estrutura de dashboards. |
| `docs/IMPLEMENTATION_PLAN.md` | **Sempre.** Ordem de implementação em fases, com checklist. Siga essa ordem e marque itens concluídos. |

## Convenções de código

- TypeScript estrito (`strict: true`) em toda a stack. Evitar `any`; se inevitável, comentar o motivo.
- **Nomes de domínio em português**, consistentes com `docs/DATA_MODEL.md` (ex: `treinoPrevisto`, `cicloId`, `paceAlvoMin`, `RpeService`). Não traduzir para inglês — o modelo mental do projeto (planilha original, dono do projeto) é em português.
- Código de infraestrutura genérico (não-domínio) segue convenção padrão do Nest CLI em inglês (`guards/`, `interceptors/`, `filters/`).
- Backend: um módulo NestJS por entidade principal (`controller` + `service` + `dto` + `*.spec.ts`), ver `docs/ARCHITECTURE.md` §7.
- Toda mudança de schema passa por migration do Prisma (`npx prisma migrate dev`) — nunca alterar o banco fora do Prisma.
- Toda rota do backend exige o guard de API key (`docs/ARCHITECTURE.md` §5), exceto `/health`.
- Testes unitários (Jest) nos services do backend. E2E não é necessário para a V1.

## Comandos

```bash
# Backend
cd backend && npm run start:dev     # dev server
cd backend && npm run test          # testes
cd backend && npm run lint
cd backend && npx prisma migrate dev   # nova migration
cd backend && npx prisma studio        # inspecionar dados

# App
cd app && npx expo start
cd app && npm run lint
```

## Variáveis de ambiente

Ver `.env.example` na raiz. Nunca commitar `.env` real. `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `DATABASE_URL` e `API_KEY` são secrets — nunca hardcode, nunca logar seus valores (nem em `console.log` de debug).

## Fora de escopo da V1 — não implementar

- Autenticação multiusuário/login — é single-user com API key fixa.
- API oficial do Garmin Developer Program (requer aprovação empresarial, não se aplica).
- Suporte a iOS ou responsividade multi-tela.
- Infra paga/CDN/cache distribuído — volume de dados é de 1 pessoa.
- Qualquer item marcado "Fase 2" em `docs/IMPLEMENTATION_PLAN.md` antes da V1 estar completa.

## Workflow esperado

1. Confira o RF correspondente em `docs/REQUIREMENTS.md` antes de codar.
2. Siga a fase atual de `docs/IMPLEMENTATION_PLAN.md`.
3. Rode lint + testes antes de considerar uma tarefa concluída.
4. Marque o item como feito em `docs/IMPLEMENTATION_PLAN.md`.
5. Se algo na spec não fizer sentido durante a implementação, **sinalize antes de desviar** — não tome decisões de arquitetura silenciosamente.
