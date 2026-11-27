import { obterBanco, ValorSql } from '../db/banco';
import { TreinoPrevisto, TreinoRealizado } from '../types/modelo';
import {
  agoraIso,
  agruparPor,
  LinhaIntervaloPrevisto,
  LinhaIntervaloRealizado,
  LinhaTreinoPrevisto,
  LinhaTreinoRealizado,
  NaoEncontradoError,
  novoId,
  paraIntervaloPrevisto,
  paraIntervaloRealizado,
  paraTreinoPrevisto,
  paraTreinoRealizado,
  soData,
} from './linhas';

// Carrega treinos previstos já com intervalos e realizados vinculados, em
// uma consulta por tabela (sem N+1). `filtro` é uma condição SQL fixa
// definida pelos chamadores deste módulo — nunca texto vindo do usuário.
export async function carregarTreinosPrevistos(
  filtro: string,
  params: ValorSql[],
  { intervalosDosRealizados = false } = {},
): Promise<TreinoPrevisto[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaTreinoPrevisto>(
    `SELECT * FROM treino_previsto WHERE ${filtro} ORDER BY data`,
    params,
  );
  if (linhas.length === 0) return [];

  const ids = `SELECT id FROM treino_previsto WHERE ${filtro}`;
  const [intervalos, realizados] = await Promise.all([
    banco.todos<LinhaIntervaloPrevisto>(
      `SELECT * FROM treino_previsto_intervalo WHERE treino_previsto_id IN (${ids}) ORDER BY ordem`,
      params,
    ),
    banco.todos<LinhaTreinoRealizado>(
      `SELECT * FROM treino_realizado WHERE treino_previsto_id IN (${ids}) ORDER BY data`,
      params,
    ),
  ]);

  const intervalosRealizados = intervalosDosRealizados
    ? agruparPor(
        await banco.todos<LinhaIntervaloRealizado>(
          `SELECT * FROM treino_realizado_intervalo WHERE treino_realizado_id IN
             (SELECT id FROM treino_realizado WHERE treino_previsto_id IN (${ids})) ORDER BY ordem`,
          params,
        ),
        (i) => i.treino_realizado_id,
      )
    : null;

  const intervalosPorTreino = agruparPor(intervalos, (i) => i.treino_previsto_id);
  const realizadosPorTreino = agruparPor(realizados, (r) => r.treino_previsto_id ?? '');

  return linhas.map((linha) => ({
    ...paraTreinoPrevisto(linha),
    intervalos: (intervalosPorTreino.get(linha.id) ?? []).map(paraIntervaloPrevisto),
    realizados: (realizadosPorTreino.get(linha.id) ?? []).map((r) => ({
      ...paraTreinoRealizado(r),
      ...(intervalosRealizados
        ? { intervalos: (intervalosRealizados.get(r.id) ?? []).map(paraIntervaloRealizado) }
        : {}),
    })),
  }));
}

export async function buscarTreinoPrevisto(id: string): Promise<TreinoPrevisto> {
  const [treino] = await carregarTreinosPrevistos('id = ?', [id], { intervalosDosRealizados: true });
  if (!treino) throw new NaoEncontradoError('Treino previsto', id);
  return treino;
}

// O treino realizado vinculado não é apagado — só perde o vínculo.
export async function excluirTreino(id: string): Promise<void> {
  await buscarTreinoPrevisto(id);
  const banco = await obterBanco();
  await banco.executar('DELETE FROM treino_previsto WHERE id = ?', [id]);
}

export async function marcarNaoRealizado(id: string, motivoNaoRealizado: string): Promise<TreinoPrevisto> {
  await buscarTreinoPrevisto(id);
  const banco = await obterBanco();
  await banco.executar(
    "UPDATE treino_previsto SET status = 'nao_realizado', motivo_nao_realizado = ? WHERE id = ?",
    [motivoNaoRealizado, id],
  );
  return buscarTreinoPrevisto(id);
}

export async function buscarTreinoRealizado(id: string): Promise<TreinoRealizado> {
  const banco = await obterBanco();
  const linha = await banco.primeiro<LinhaTreinoRealizado>('SELECT * FROM treino_realizado WHERE id = ?', [id]);
  if (!linha) throw new NaoEncontradoError('Treino realizado', id);
  const intervalos = await banco.todos<LinhaIntervaloRealizado>(
    'SELECT * FROM treino_realizado_intervalo WHERE treino_realizado_id = ? ORDER BY ordem',
    [id],
  );
  return { ...paraTreinoRealizado(linha), intervalos: intervalos.map(paraIntervaloRealizado) };
}

export interface RegistrarFeedbackInput {
  rpe?: number;
  sensacoes?: string[];
  feedbackTexto?: string;
}

// RF18: RPE, tags de sensação e relato livre.
export async function registrarFeedback(
  treinoRealizadoId: string,
  dados: RegistrarFeedbackInput,
): Promise<TreinoRealizado> {
  const atual = await buscarTreinoRealizado(treinoRealizadoId);
  const banco = await obterBanco();
  await banco.executar('UPDATE treino_realizado SET rpe = ?, sensacoes = ?, feedback_texto = ? WHERE id = ?', [
    dados.rpe !== undefined ? dados.rpe : atual.rpe,
    JSON.stringify(dados.sensacoes ?? atual.sensacoes),
    dados.feedbackTexto !== undefined ? dados.feedbackTexto : atual.feedbackTexto,
    treinoRealizadoId,
  ]);
  return buscarTreinoRealizado(treinoRealizadoId);
}

export interface CriarTreinoRealizadoInput {
  treinoPrevistoId?: string;
  data: string;
  distanciaKm?: number;
  duracaoSegundos?: number;
  paceMedio?: string;
  fcMedia?: number;
  fcMax?: number;
  elevacaoM?: number;
  rpe?: number;
  sensacoes?: string[];
  feedbackTexto?: string;
  observacoes?: string;
}

// RF16: registro manual (quando o treino não veio do Garmin).
export async function registrarTreinoManual(dados: CriarTreinoRealizadoInput): Promise<TreinoRealizado> {
  if (dados.treinoPrevistoId) await buscarTreinoPrevisto(dados.treinoPrevistoId);
  const banco = await obterBanco();
  const id = novoId();
  await banco.transacao(async () => {
    await banco.executar(
      `INSERT INTO treino_realizado (id, treino_previsto_id, fonte, data, distancia_km, duracao_segundos, pace_medio,
         fc_media, fc_max, elevacao_m, rpe, sensacoes, feedback_texto, observacoes, criado_em)
       VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dados.treinoPrevistoId ?? null,
        soData(dados.data),
        dados.distanciaKm ?? null,
        dados.duracaoSegundos ?? null,
        dados.paceMedio ?? null,
        dados.fcMedia ?? null,
        dados.fcMax ?? null,
        dados.elevacaoM ?? null,
        dados.rpe ?? null,
        JSON.stringify(dados.sensacoes ?? []),
        dados.feedbackTexto ?? null,
        dados.observacoes ?? null,
        agoraIso(),
      ],
    );
    if (dados.treinoPrevistoId) {
      await banco.executar("UPDATE treino_previsto SET status = 'realizado' WHERE id = ?", [dados.treinoPrevistoId]);
    }
  });
  return buscarTreinoRealizado(id);
}
