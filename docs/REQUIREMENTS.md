# Requisitos

## Requisitos Funcionais (RF)

### Ciclos e Provas

| ID | Requisito |
|---|---|
| RF01 | Criar, editar e excluir Ciclos de Preparação (nome, data início/fim, prova alvo, meta de tempo). |
| RF02 | Cadastrar uma prova **alvo** e, opcionalmente, uma ou mais provas **secundárias** dentro do mesmo ciclo. |
| RF03 | Registrar resultado de uma prova (tempo, pace) e marcá-la como concluída. |
| RF04 | Consultar histórico de ciclos já concluídos. |

### Planejamento de treinos

| ID | Requisito |
|---|---|
| RF05 | Importar o plano de treinos previsto via arquivo CSV/JSON. |
| RF06 | Número de treinos previstos por semana configurável por ciclo (não fixo em 4). |
| RF07 | Cada treino previsto tem: dia/data, tipo (rodagem, qualidade, longo, descanso), descrição, distância e/ou duração alvo, faixa de pace alvo. |
| RF08 | Para treinos intervalados ("tiro"), estruturar a série: aquecimento, repetições (distância/pace alvo), recuperação, desaquecimento. |
| RF09 | *(Fase 2)* Editar treino previsto direto no app, sem reimportar planilha. |

### Sincronização com Garmin

| ID | Requisito |
|---|---|
| RF10 | Sincronizar automaticamente as atividades do Garmin Connect 1x/dia, em horário configurável. |
| RF11 | Permitir disparo manual da sincronização a partir do app. |
| RF12 | Importar por atividade: data, distância, duração, pace médio, FC média/máxima, elevação. |
| RF13 | Para atividades intervaladas, importar splits (aquecimento, tiros, recuperações) com tempo, distância, pace e FC de cada trecho. |
| RF14 | Evitar duplicar atividades já sincronizadas (idempotência pelo ID da atividade Garmin). |
| RF15 | Casar automaticamente cada atividade importada com o treino previsto correspondente (mesma data ± 1 dia). Um treino previsto pode acumular mais de uma atividade vinculada (ex: Garmin registrou o treino como duas atividades separadas por esquecimento de retomar o cronômetro) — nesse caso todas ficam vinculadas ao mesmo previsto e são somadas na comparação, em vez de a segunda atividade ficar órfã. |

### Registro manual e feedback

| ID | Requisito |
|---|---|
| RF16 | Inserir manualmente um treino realizado (quando não vier do Garmin). |
| RF17 | Marcar um treino previsto como "não realizado", com campo de motivo. |
| RF18 | Registrar feedback estruturado de um treino: RPE (1-10), tags de sensação (múltipla escolha) e texto livre. |

### Comparação e Dashboards

| ID | Requisito |
|---|---|
| RF19 | Exibir, por semana, o previsto x realizado de cada treino, com indicação visual de dentro/fora da meta ou não realizado. Quando houver mais de uma atividade vinculada ao mesmo previsto (ver RF15), distância/duração são somadas e o pace exibido é a média ponderada pela distância. |
| RF20 | Exibir, para o ciclo ativo, total de km realizados x planejados e quanto falta até a prova. |
| RF21 | Exibir contagem regressiva até a data da prova alvo. |
| RF22 | Para treinos de tiro, exibir gráfico e lista comparando pace planejado x realizado de cada repetição (só os tiros, sem os trotes de recuperação). O Garmin não distingue tiro de trote no dado bruto — o casamento usa a posição alternada dos laps de corrida (ímpar = tiro, par = trote), não o `repeticao_numero` bruto do Garmin. Se houver mais de uma atividade vinculada ao previsto (ver RF15), os splits de todas elas são combinados antes desse casamento. |
| RF23 | *(Fase 2)* Exibir evolução de pace médio e FC ao longo do ciclo. |
| RF24 | *(Fase 2)* Comparar métricas entre ciclos diferentes. |

## Requisitos Não Funcionais (RNF)

| ID | Requisito |
|---|---|
| RNF01 | Single-user: não precisa suportar múltiplos usuários nem cadastro público. |
| RNF02 | Comunicação app↔backend sempre via HTTPS. |
| RNF03 | Acesso à API do backend protegido por token fixo (API key), sem login completo. |
| RNF04 | Credenciais do Garmin Connect apenas em variáveis de ambiente/secret manager, nunca no código-fonte. |
| RNF05 | Sincronização com Garmin limitada a poucas execuções/dia (Garmin Personal API, ver `ARCHITECTURE.md` §3). |
| RNF06 | App continua funcional (planejamento, dashboards) mesmo se a sincronização Garmin estiver indisponível. |
| RNF07 | Banco com backup automático do provedor + export manual sob demanda. |
| RNF08 | App responsivo apenas para a resolução do celular alvo — não precisa suportar múltiplos tamanhos de tela nem iOS. |
| RNF09 | Backend e app com pipeline de CI/CD (lint + testes + build antes de deploy). |
| RNF10 | TypeScript em toda a stack. |
| RNF11 | Infraestrutura dentro dos limites gratuitos dos provedores (Supabase, Railway/Render, EAS Build). |
| RNF12 | Sistema tolerante a falhas da integração com o Garmin (API fora do ar, chave expirada) sem quebrar o restante do app. |
