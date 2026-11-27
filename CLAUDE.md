# CLAUDE.md

Instruções de projeto para o Claude Code. Leia este arquivo sempre. Os documentos em `docs/` só precisam ser lidos quando a tarefa exigir aquele detalhe — não carregue tudo de uma vez, referencie sob demanda.

## O que é este projeto

App Android **pessoal** (single-user) para acompanhar treinos de corrida: guarda o plano de treino previsto, sincroniza os treinos realizados do Garmin Connect, compara previsto x realizado, organiza tudo em ciclos de preparação para provas (com fases, provas secundárias, e treinos de tiro/intervalado).

Uso 100% pessoal. Não haverá outros usuários, não vai para a Play Store, não precisa escalar.

## Arquitetura: tudo no celular, sem servidor

Desde 2026-11-08 não existe mais backend. O app guarda tudo num SQLite local e fala direto com a Garmin. Backup é **manual**: em Configurações, o app exporta um JSON para a pasta que o usuário escolher e restaura a partir desse arquivo. Nada é automatizado.

| Camada | Tecnologia |
|---|---|
| App | React Native + Expo (SDK 57), TypeScript, Hermes |
| Banco | `expo-sqlite`, local no aparelho (`src/db/`). Migrations em `src/db/esquema.ts` (`PRAGMA user_version`) |
| Segredo | Chave da Garmin no `expo-secure-store` (Android Keystore), digitada em Configurações. Nunca vai para o SQLite nem para o backup |
| Garmin | Personal API oficial (uso pessoal). Token de ~24h obtido com a chave e guardado só em memória. Laps lidos do FIT (ZIP do download-service) com `@garmin/fitsdk` + `fflate` (`src/dominio/garmin.ts`) |
| Sync | Ao abrir o app, se a última sincronização tiver mais de 12h (`sincronizarSeNecessario`), e também pelo botão manual |
| Backup | `src/services/backup.ts`: JSON com whitelist de tabelas e colunas (`TABELAS_BACKUP`); a restauração valida tudo e roda numa única transação |
| Build | APK via EAS Build (`preview` → APK), disparado manualmente |
| CI | GitHub Actions (`.github/workflows/app.yml`): lint, typecheck, testes, gitleaks |

> `docs/ARCHITECTURE.md` e `docs/DATA_MODEL.md` ainda descrevem a arquitetura antiga (NestJS/Prisma/Postgres) e precisam ser atualizados. Se divergirem do código, vale o código e este arquivo.

## Estrutura

```
app/
  src/db/         banco.ts (conexão + interface Banco), esquema.ts (migrations, TABELAS_BACKUP)
  src/dominio/    lógica pura, sem I/O: textoTreino, planilhaCsv, garmin (FIT/laps)
  src/services/   acesso a dados e integrações: ciclos, semanas, treinos, provas, import, sync, backup, arquivos, configuracoes
  src/screens/    telas; src/components/, src/utils/ (dashboards e comparações)
  src/types/modelo.ts  tipos do domínio usados pelas telas
  test/           vitest + node:sqlite (stubs de expo-crypto / expo-secure-store em test/stubs)
docs/             especificação (ler sob demanda)
```

## Documentos de referência (ler conforme a tarefa)

| Documento | Quando ler |
|---|---|
| `docs/REQUIREMENTS.md` | **Antes de implementar qualquer feature nova.** Lista todos os RF (requisitos funcionais) e RNF (não funcionais). Cada feature deve mapear para um RF. |
| `docs/DATA_MODEL.md` | Modelo conceitual das entidades. O schema físico (SQLite) é `app/src/db/esquema.ts`. |
| `docs/ARCHITECTURE.md` | Integração Garmin, dashboards (ver o aviso acima sobre a parte de infra). |
| `docs/IMPLEMENTATION_PLAN.md` | **Sempre.** Ordem de implementação em fases, com checklist. Siga essa ordem e marque itens concluídos. |

## Convenções de código

- TypeScript estrito (`strict: true`). Evitar `any`; se inevitável, comentar o motivo.
- **Nomes de domínio em português** (ex: `treinoPrevisto`, `cicloId`, `paceAlvoMin`). Não traduzir para inglês: o modelo mental do projeto (a planilha original e o dono do projeto) é em português. No banco, as colunas são snake_case (`ciclo_id`); `services/linhas.ts` converte para camelCase.
- Toda mudança de schema é uma **nova** entrada em `MIGRACOES` (`src/db/esquema.ts`); nunca editar uma migration já publicada. Se a mudança afetar tabelas ou colunas, atualizar `TABELAS_BACKUP` e `VERSAO_ESQUEMA`.
- SQL sempre parametrizado (`?`). Nomes de tabela e coluna interpolados só a partir de listas fixas do código.
- Escritas que tocam várias tabelas rodam em `banco.transacao`.
- `src/dominio/` não importa Expo nem banco, para continuar testável em Node.
- Testes (vitest) para domínio e services, usando o banco em memória de `test/bancoDeTeste.ts`. E2E não é necessário para a V1.

## Comandos

```bash
npm run app:start       # expo start
npm run app:lint
npm run app:typecheck
npm run app:test        # vitest (requer Node 24, por causa do node:sqlite)

cd app && npx eas-cli@latest build -p android --profile preview   # gera o APK
```

## Segredos

A chave da Garmin só existe no SecureStore do aparelho. Nunca colocar em código, `.env`, SQLite, backup ou log (nem em `console.log` de debug), nem o token derivado dela.

## Fora de escopo da V1 — não implementar

- Autenticação multiusuário/login.
- Servidor, sincronização em nuvem ou backup automático (decisão de 2026-11-08: backup só manual).
- API do Garmin Developer Program (requer aprovação empresarial, não se aplica).
- Suporte a iOS ou responsividade multi-tela.
- Qualquer item marcado "Fase 2" em `docs/IMPLEMENTATION_PLAN.md` antes da V1 estar completa.

## Workflow esperado

1. Confira o RF correspondente em `docs/REQUIREMENTS.md` antes de codar.
2. Siga a fase atual de `docs/IMPLEMENTATION_PLAN.md`.
3. Rode lint + typecheck + testes antes de considerar uma tarefa concluída.
4. Marque o item como feito em `docs/IMPLEMENTATION_PLAN.md`.
5. Se algo na spec não fizer sentido durante a implementação, **sinalize antes de desviar**. Não tome decisões de arquitetura em silêncio.
