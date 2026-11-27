# Plano de Implementação

Seguir a ordem abaixo. Marcar `[x]` ao concluir cada item. Não iniciar "Fase 2" antes da V1 (MVP) estar completa e funcional ponta a ponta.

## Fase 0 — Setup do projeto

- [x] Monorepo com workspaces (`app/`, `backend/`) — ver `package.json` raiz
- [x] Backend: `nest new backend`, configurar TypeScript strict, ESLint, Jest
- [x] Backend: Prisma configurado, conexão com Supabase testada
- [x] App: `npx create-expo-app`, TypeScript, ESLint
- [x] `.env.example` preenchido e `.env` real configurado localmente (não commitado)
- [x] CI/CD: workflows `backend.yml` e `app.yml` criados e passando (mesmo que só com lint/test, sem deploy real ainda)

## Fase 1 — MVP (V1)

### Backend — domínio base

- [x] Prisma schema completo a partir de `docs/DATA_MODEL.md`, primeira migration
- [x] Guard de API key (RNF03) aplicado globalmente, exceto `/health`
- [x] Módulo `ciclos`: CRUD (RF01), suporte a prova alvo + secundárias (RF02), registro de resultado (RF03), histórico (RF04)
- [x] Módulo `semanas`: criação vinculada a ciclo, cálculo de km/tempo total (derivado, não armazenado)
- [x] Módulo `treinos`: CRUD de `treino_previsto` (RF07), suporte a `treino_previsto_intervalo` (RF08), marcação de não realizado + motivo (RF17)

### Backend — import

- [x] Módulo `import`: parser de CSV (RF05), geração de `semana` + `treino_previsto`
- [x] Parser de descrição de treino intervalado → `treino_previsto_intervalo` estruturado (RF08)

### Backend — Garmin

- [x] Módulo `garmin`: `GarminService` usando `garmin-connect`, login testado localmente primeiro
- [x] Cron `@nestjs/schedule` (RF10) + endpoint manual `POST /sync/garmin` (RF11)
- [x] Import de atividade + splits (RF12, RF13), idempotência por `garmin_activity_id` (RF14)
- [x] Matching automático previsto↔realizado por data (RF15), matching de intervalos por `repeticao_numero`
- [x] Try/catch isolado — falha de sync não derruba outras rotas (RNF12)
- [x] Endpoint de registro manual de treino (RF16) e de feedback estruturado — RPE, tags, texto (RF18)

### App — telas essenciais

- [x] Tela **Semana**: previsto x realizado, ícones de status — validar modelo de dados cedo (é a tela que mais replica a planilha original)
- [x] Formulário de feedback estruturado (RPE + tags + texto) e marcação "não realizado" + motivo
- [x] Botão "Sincronizar agora" (Garmin)
- [x] Dashboard **Home/Ciclo Ativo**: contagem regressiva, progresso km, aderência da semana (RF19, RF20, RF21)
- [x] Tela **Detalhe do Treino de Tiro**: gráfico planejado x realizado por repetição (RF22) — melhor-esforço, ver "Pendências" abaixo

### App — lacunas de UI + design (auditoria pós-Fase 1)

As telas essenciais cobrem RF17-RF22 (feedback, dashboards). Mas RF01-RF05 e RF16
têm endpoint pronto no backend e **nenhuma tela no app** — hoje só dá pra criar
ciclo/prova/importar planilha via API direta. Esta seção fecha isso, junto com
uma base visual mínima (não existia nenhuma até agora — telas eram só
`StyleSheet` cru, sem cores/tipografia consistentes).

- [x] Base visual: `theme.ts` (cores, tipografia, espaçamento) + componentes reutilizáveis (Button, Card, Screen, EmptyState, LoadingState, TextField, Chip) — aplicado retroativamente nas 4 telas existentes (Home, Semana, TreinoDetalhe, TreinoTiro)
- [x] Tela **Criar/Editar Ciclo** (RF01): formulário nome, datas, prova alvo, meta de tempo; excluir ciclo
- [x] Tela **Importar planilha** (RF05): seletor de arquivo CSV (`expo-document-picker`) + upload multipart, mostra resumo de erros de linha
- [x] Tela/seção **Provas** (RF02, RF03): cadastrar prova alvo/secundária dentro do ciclo, registrar resultado (tempo, pace)
- [x] Tela **Histórico de Ciclos** (RF04): lista de ciclos concluídos + resultado das provas
- [x] Fluxo **Registrar treino manual** (RF16): formulário completo (data, distância, duração, pace, FC) pra treino sem Garmin, separado do formulário de feedback que já existe

### Fechamento da V1

- [ ] CI/CD com deploy real configurado (Railway/Render + EAS Build) — resolve RNF02 (HTTPS) via TLS automático do provedor
- [ ] Export manual de dados sob demanda (RNF07) — endpoint + botão simples pra baixar um dump/export do banco
- [ ] Testar fluxo completo: import de planilha → sync Garmin → comparação → feedback
- [ ] Revisar todos os RF/RNF de `docs/REQUIREMENTS.md` contra o que foi implementado

## Fase 2 (só depois da V1 fechada)

- [ ] Editar treino previsto direto no app, sem reimportar planilha (RF09)
- [ ] Gráfico de evolução de pace médio e FC ao longo do ciclo (RF23)
- [ ] Comparação entre ciclos diferentes (RF24)
- [ ] Exportar relatório do ciclo em PDF
- [ ] Alertas simples de aderência (ex: "faltam 3 dias e você está X km abaixo do planejado")
- [ ] Cruzar feedback (RPE/tags) com desempenho real ao longo do ciclo
- [ ] Tela **Progresso do Ciclo** e **Histórico de Ciclos** completas (versão básica pode já existir desde a Fase 1 se o tempo permitir)

## Correções pós-auditoria (feedback do dono do projeto, 2026-08-21)

- [x] **Ciclo não guarda mais a prova alvo em campos soltos.** `prova_alvo`/`data_prova`/`meta_tempo`/`distancia_prova_km` saíram de `ciclo` (migration `ciclo_usa_prova_relacionada`) — agora é sempre a `Prova` com `tipo='alvo'` vinculada ao ciclo, criada junto no `POST /ciclos` e editável via `PATCH /ciclos/:id`. Corrige a dessincronização entre a tela Provas e o dashboard (contagem regressiva/km). `ProvasService` agora impede excluir a prova alvo ou criar uma segunda. Ver nota em `docs/DATA_MODEL.md`.
- [x] Tela Histórico de Ciclos passou a mostrar o resultado da prova alvo (tempo/pace) quando concluída — antes só listava nome/datas do ciclo, sem resultado (RF04 incompleto).
- [x] `Alert.alert` trocado por um componente `Banner` inline nas telas de sync/ciclo/provas/histórico — evita a limitação do RN Web (Alert.alert é no-op no navegador) e deixa erros mais fáceis de reler.
- [x] Removido o ciclo de teste "Meia Maratona de Exemplo" do banco (misturava dados de teste antigos com a primeira planilha real importada).
- [x] **Navegação principal virou barra inferior de abas** (Início / Provas / Importar / Dados do Garmin, estilo Instagram) em vez de tudo dentro de uma stack só a partir da Home. `HomeStackParamList` (Home, Semana, TreinoDetalhe, TreinoTiro, CriarEditarCiclo, HistoricoCiclos, RegistrarTreinoManual) continua como stack aninhada dentro da aba Início; Provas/Importar/Garmin agora buscam o ciclo ativo sozinhas (não recebem mais `cicloId` por parâmetro de rota).
- [x] **Performance: telas lentas (2-3s) diagnosticadas como latência de rede até o Supabase (`us-west-2`, ~230ms de round-trip a partir do Brasil), multiplicada por 5 queries sequenciais que o Prisma fazia pra cada tela com relações aninhadas** (`ciclo`→`semana`→`treino_previsto`→`{intervalos, realizados}` viravam 5 SELECTs separados em vez de 1 JOIN). Ativado `relationLoadStrategy: 'join'` (preview feature `relationJoins` no generator) nos includes aninhados de `SemanasService`, `TreinosService`, `TreinoRealizadoService` e `CiclosService` — colapsa pra 1-2 queries por chamada. Medido: `GET /ciclos/:id/semanas` caiu de ~950ms pra ~470ms; carregamento completo da Home (2 chamadas) de ~1.6-2s pra ~0.8-1s. O piso restante (~230ms por query) é a latência de rede até `us-west-2` — só reduz de verdade migrando o projeto Supabase pra uma região mais próxima (`sa-east-1`, São Paulo), decisão de infra ainda não tomada (ver conversa/Pendências).
- [x] **Segunda causa do km total errado: treinos intervalados importados antes do parser aceitar metros/minutos ficaram sem `treino_previsto_intervalo` gravado.** `SemanasService.estimarKm` agora tenta reconhecer o padrão de repetição ao vivo (reusa `parseTreinoIntervalado` sobre a `descricao`) quando não há intervalos persistidos, em vez de contar 0. Semana 8 do "Meia SM" foi de 43.82 para 56.91 km sem reimportar.
- [x] Home: contador "X/Y treinos concluídos" (+ atrasados) e contagem regressiva (menor) pra cada prova secundária, ao lado da prova alvo.
- [x] Removidos os links "Importar planilha"/"Provas" do painel da Home — já estão na barra de abas, ficavam duplicados.
- [x] Nova aba **Diário de Treinos** (📝): feed de todos os treinos realizados (Garmin + manual) com RPE colorido por faixa, sensações, feedback livre e o treino previsto casado, mais um resumo dos últimos 7 treinos (km, RPE médio, sensação mais comum) no topo.
- [x] **Km/tempo total não precisam mais de reimportar a planilha pra corrigir.** A extração de duração ("45 min Leve") só acontecia no momento do import, então treinos importados antes desse fix ficavam com `duracao_alvo_segundos = null` pra sempre. `SemanasService` agora tem um fallback que tenta extrair a duração da descrição em tempo real quando a coluna está vazia — beneficia dados já importados sem precisar excluir e reimportar.
- [x] **Histórico de importações + exclusão em lote.** Nova tabela `importacao` (migration `adiciona_importacao`) vinculada a cada `treino_previsto` criado por ela (`ON DELETE CASCADE`). Tela Importar planilha agora lista as últimas importações do ciclo (arquivo, data, semanas/treinos criados) com botão "Excluir esta importação" — remove só os treinos daquele upload (a semana continua existindo, mesmo vazia, já que pode ser reaproveitada por outro import). Endpoints: `GET /ciclos/:cicloId/importacoes`, `DELETE /importacoes/:id`.
- [x] **Parser de treino intervalado passou a aceitar metros e minutos** (`"10x 400m (1min trote)"`, não só `"6x 1km (90s trote)"`) — a planilha real do dono do projeto usa os dois formatos. Testado com o CSV real completo: 12 semanas, 48 treinos, 0 erros.
- [x] **Estimativa de km ganhou um pace padrão de 5:30/km** quando a planilha não informa pace nenhum, e o trote de recuperação entre tiros sempre usa esse pace padrão (não tem pace próprio no modelo). Trechos de distância sem bloco de repetição (ex: "2km Leve + 6km Ritmo Prova + 1km Leve") também passaram a entrar na soma.
- [x] Home: semanas concluídas (data fim no passado) agora vão pro fim da lista, numa seção "Concluídas" (texto igual ao título "Semanas"), mais recente primeiro — antes ficavam misturadas cronologicamente.
- [x] **Km planejado do ciclo estava subestimado.** `Semana.kmPlanejadoTotal` só somava `treino_previsto.distancia_alvo_km` — treinos descritos só por tempo (ex: "45 min Leve", sem km na planilha) contribuíam 0, e treinos intervalados sem distância total no cabeçalho também. Corrigido em `SemanasService.estimarKm`: quando falta a distância, usa a soma dos `intervalos` (aquecimento/tiros/desaquecimento) se o treino for intervalado, senão estima por duração × pace médio alvo. O import (`ImportService`) também passou a extrair a duração de descrições como "45 min Leve" (`common/duracao-descricao.util.ts`) — antes isso nunca era gravado.
- [x] Home: lista de semanas agora mostra o intervalo de datas ao lado do número, fixa a semana atual no topo, destaca semanas já concluídas em verde, e mostra "realizado / planejado" (km) alinhado à direita de cada linha.
- [x] **Bug real de integridade de dados encontrado e corrigido**: excluir um ciclo/semana só desvincula (`ON DELETE SET NULL`) o `treino_realizado` ligado, nunca apaga — um registro de teste de semanas atrás (ciclo já excluído) ficou órfão e foi silenciosamente recasado pelo sweep de RF15 (`casarPendentesComPrevisto`) com um treino real do ciclo novo na mesma data. Removido o registro órfão específico (13/08) e o treino voltou a "pendente"/"não realizado" via API — o botão "Excluir treino" do app só apaga o treino previsto inteiro, não existia forma de remover só a corrida.
- [x] **Novo endpoint `DELETE /treinos-realizados/:id`** + botão "Excluir corrida" na tela Treino (dentro do formulário de feedback) — remove só o registro do que foi corrido, o treino previsto volta pra "pendente" automaticamente. Preenche a lacuna acima: antes só dava pra apagar o treino previsto inteiro.
- [x] Botões "Excluir semana" (tela Semana) e "Excluir treino" (tela Treino) no app — os endpoints `DELETE /semanas/:id` e `DELETE /treinos/:id` já existiam no backend desde a Fase 1, mas não tinham UI. Excluir um treino previsto não apaga o `treino_realizado` vinculado (Garmin ou manual) — só desvincula (`ON DELETE SET NULL`).
- [x] Nova tela **Dados do Garmin** (`GET /treinos-realizados?fonte=garmin`, novo endpoint): lista as atividades sincronizadas com distância/duração/pace/FC/elevação e indica se cada uma foi casada com um treino previsto (RF15) — dá visibilidade ao que RF12-RF14 já importavam sem tela dedicada até agora.
- [x] **Bug real de matching: Garmin registrou um treino como duas atividades separadas (esqueceu de retomar o cronômetro) e a segunda ficou órfã.** `casarComPrevisto` (`sync.service.ts`) excluía qualquer `treino_previsto` que já tivesse **qualquer** `treino_realizado` vinculado (`realizados: { none: {} }`), então a primeira atividade "roubava" o vínculo e a segunda não tinha mais candidato elegível. Removida a exclusão — um previsto agora pode acumular N realizados (RF15), e toda a leitura que assumia `realizados[0]` (`comparacao.ts`, `comparacaoTiro.ts`, `dashboard.ts`, `SemanaScreen.tsx`, `TreinoDetalheScreen.tsx`) passou a agregar (somar distância/duração, pace médio ponderado, juntar splits de tiro) via `agregarRealizados`. Caso real de 22/08 corrigido manualmente no banco (atividade "2km aquecimento" vinculada ao mesmo previsto de "10x400m+1km").

## Pendências (verificar com calma depois)

- **Região do Supabase (`us-west-2`, Oregon) está longe do usuário** — cada query paga ~230ms de round-trip só de rede. Depois de reduzir pra 1-2 queries/tela (ver acima), esse é o piso que sobra. Opção: criar um novo projeto Supabase em `sa-east-1` (São Paulo) e migrar os dados (`pg_dump`/`pg_restore`), trocar `DATABASE_URL`. Reduziria o round-trip pra ~20-40ms — outra queda de ~5-10x. Não fiz isso ainda porque envolve migração de dados e troca de credencial, decisão do dono do projeto.

- [x] ~~**Endpoint de splits do Garmin não é oficial.**~~ Resolvido com a migração para a Garmin Personal API (ver item abaixo) — os laps agora vêm do arquivo FIT original da atividade, formato oficial e documentado pela Garmin.
- [x] **As libs Node não-oficiais (`garmin-connect`, `@gooin/garmin-connect`) pararam de autenticar (set/2026).** Garmin mudou o fluxo de login; as duas libs Node testadas falhavam com `login failed (Ticket not found or MFA)` mesmo com credenciais corretas (confirmado: login manual funcionava normalmente). A lib Python `garminconnect` (mantida ativamente) já tinha sido corrigida pro fluxo atual — validada manualmente (login + atividades + splits com `intensityType` warmup/active/recovery/cooldown, todos os campos que já usávamos). Solução: `GarminService` passou a delegar a autenticação a um subprocesso Python persistente por sessão (`backend/garmin_client/session.py`), mantendo as mesmas assinaturas públicas — `sync.service.ts` e o mapper não mudaram. Ver `ARCHITECTURE.md` §3.1. **Substituído em nov/2026 pela Personal API (item abaixo).**
- [x] **Sync do Garmin migrado para a Garmin Connect Personal API oficial (nov/2026).** A Garmin liberou chave de API para uso pessoal (`connect.garmin.com/app/settings/personalApiToken`), sem aprovação empresarial. `GarminService` virou HTTP puro em TypeScript: troca `GARMIN_API_KEY` por access token (~24h, em memória), lista atividades em `activitylist-service` e, para os laps, baixa o FIT original (`download-service`) e lê com `@garmin/fitsdk` — a API não expõe splits em JSON (404). Removidos: subprocesso Python (`garmin_client/`, `requirements.txt`, venv no `postinstall`), `GARMIN_EMAIL`/`GARMIN_PASSWORD` e a tabela `garmin_sessao` (migration `remove_garmin_sessao`). Elimina o risco de rate limit 429 no SSO e a violação de Termos de Uso. Efeito colateral bom: o FIT marca trote como `recovery`, então `montarComparacaoTiros` passou a usar o tipo explícito quando disponível (heurística de alternância continua para atividades antigas). Ver `ARCHITECTURE.md` §3.1 e `DATA_MODEL.md` (matching de intervalos). **Pendência:** a chave expira (máx. 1 ano) — renovar manualmente quando a Garmin avisar por e-mail.
- [x] **`intensityType` do Garmin não distingue tiro de recuperação — resolvido com heurística de alternância.** `intensityType` só vem como `WARMUP`/`ACTIVE`/`COOLDOWN` (nunca `REST`), então todo lap do meio de um treino intervalado chega com `tipo = 'run'` e `repeticaoNumero` sequencial contando tiro+trote juntos (1..20 pra 10x400m), em vez de numerar só os tiros como o previsto faz (1..10). Confirmado contra atividade real de 22/08 (10x400m): dentro da sequência de laps `run`, eles alternam tiro/trote **sempre começando pelo tiro** — posições ímpares (1ª, 3ª, 5ª...) são tiro (0.4km, pace forte), pares são trote (distância menor, pace bem mais lento). `montarComparacaoTiros` (`app/src/utils/comparacaoTiro.ts`) agora usa essa alternância (índice par/ímpar da lista de laps `run`, não o `repeticaoNumero` bruto) pra casar cada tiro/trote previsto com o realizado por posição — resolve RF15 e RF22 juntos, sem precisar de coluna nova no banco. `TreinoTiroScreen` continua mostrando só os tiros (gráfico + lista); cheguei a expor os trotes na lista com um toggle "Mostrar apenas tiros", mas o dono do projeto achou que não ficou bom visualmente e pediu pra tirar — a função `montarComparacaoTiros` retorna os dois tipos (`tipo: 'tiro' | 'trote'`), a tela é que filtra só `tiro`, então dá pra reexibir os trotes no futuro sem mexer na lógica de casamento. Limitação que continua valendo: se uma atividade real tiver menos repetições que o previsto (parou no meio, GPS falhou), o restante casa por posição vazia e aparece como "sem correspondência".
- **Matching de intervalos por `repeticao_numero` (segunda parte da RF15) não grava nada no banco.** Não existe coluna de FK entre `treino_previsto_intervalo` e `treino_realizado_intervalo` no `DATA_MODEL.md` — o "casamento" é só um join em tempo de consulta pelo valor de `repeticao_numero` (feito agora em `montarComparacaoTiros` pro RF22), não algo persistido.
- **`Alert.alert` do React Native não funciona no navegador (testes web).** Usado em várias telas (confirmar exclusão de ciclo, resultado da sincronização, erros de formulário). No Android real funciona normalmente (diálogo nativo do sistema), mas ao testar via `expo start --web` ele não produz nenhum diálogo interativo — não consegui verificar visualmente a confirmação de "Excluir ciclo" por esse motivo (só validei o endpoint `DELETE /ciclos/:id` isoladamente via curl). Vale testar esse fluxo específico direto no celular quando possível.
