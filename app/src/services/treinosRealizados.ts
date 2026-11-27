import { Banco, obterBanco } from '../db/banco';
import { FonteTreinoRealizado, TreinoPrevisto, TreinoRealizadoComPrevisto } from '../types/modelo';
import {
  LinhaTreinoPrevisto,
  LinhaTreinoRealizado,
  NaoEncontradoError,
  paraTreinoPrevisto,
  paraTreinoRealizado,
  soData,
  somarDias,
} from './linhas';

interface LinhaComPrevisto extends LinhaTreinoRealizado {
  p_id: string | null;
  p_semana_id: string | null;
  p_dia_semana: string | null;
  p_data: string | null;
  p_tipo: TreinoPrevisto['tipo'];
  p_descricao: string | null;
}

// Diário de treinos e tela "Dados do Garmin" (RF12-RF15, RF18).
export async function listarTreinosRealizados(fonte?: FonteTreinoRealizado): Promise<TreinoRealizadoComPrevisto[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaComPrevisto>(
    `SELECT r.*, p.id AS p_id, p.semana_id AS p_semana_id, p.dia_semana AS p_dia_semana, p.data AS p_data,
            p.tipo AS p_tipo, p.descricao AS p_descricao
       FROM treino_realizado r LEFT JOIN treino_previsto p ON p.id = r.treino_previsto_id
      ${fonte ? 'WHERE r.fonte = ?' : ''}
      ORDER BY r.data DESC, r.criado_em DESC`,
    fonte ? [fonte] : [],
  );
  return linhas.map((l) => ({
    ...paraTreinoRealizado(l),
    treinoPrevisto: l.p_id
      ? {
          id: l.p_id,
          semanaId: l.p_semana_id ?? '',
          diaSemana: l.p_dia_semana ?? '',
          data: l.p_data ?? '',
          tipo: l.p_tipo,
          descricao: l.p_descricao ?? '',
        }
      : null,
  }));
}

// O previsto volta para "pendente" quando não sobra nenhum realizado
// vinculado a ele (um previsto pode acumular mais de um, ver RF15).
async function liberarPrevistoSeSemRealizados(banco: Banco, treinoPrevistoId: string | null): Promise<void> {
  if (!treinoPrevistoId) return;
  const restante = await banco.primeiro('SELECT id FROM treino_realizado WHERE treino_previsto_id = ? LIMIT 1', [
    treinoPrevistoId,
  ]);
  if (!restante) {
    await banco.executar("UPDATE treino_previsto SET status = 'pendente' WHERE id = ? AND status = 'realizado'", [
      treinoPrevistoId,
    ]);
  }
}

async function buscarLinha(banco: Banco, id: string): Promise<LinhaTreinoRealizado> {
  const linha = await banco.primeiro<LinhaTreinoRealizado>('SELECT * FROM treino_realizado WHERE id = ?', [id]);
  if (!linha) throw new NaoEncontradoError('Treino realizado', id);
  return linha;
}

// Remove um realizado errado/duplicado sem apagar o previsto.
export async function excluirTreinoRealizado(id: string): Promise<void> {
  const banco = await obterBanco();
  const treino = await buscarLinha(banco, id);
  await banco.transacao(async () => {
    await banco.executar('DELETE FROM treino_realizado WHERE id = ?', [id]);
    await liberarPrevistoSeSemRealizados(banco, treino.treino_previsto_id);
  });
}

// Candidatos para "Editar vínculo": previstos numa janela de dias em torno
// da data do realizado, de qualquer semana/ciclo.
export async function buscarCandidatosVinculo(data: string, janelaDias = 7): Promise<TreinoPrevisto[]> {
  const banco = await obterBanco();
  const dia = soData(data);
  const linhas = await banco.todos<LinhaTreinoPrevisto>(
    'SELECT * FROM treino_previsto WHERE data BETWEEN ? AND ? ORDER BY data',
    [somarDias(dia, -janelaDias), somarDias(dia, janelaDias)],
  );
  return linhas.map(paraTreinoPrevisto);
}

// Corrige o casamento automático (RF15) ligando/religando manualmente.
export async function vincularTreinoRealizado(id: string, treinoPrevistoId: string | null): Promise<void> {
  const banco = await obterBanco();
  const treino = await buscarLinha(banco, id);
  if (treinoPrevistoId) {
    const previsto = await banco.primeiro('SELECT id FROM treino_previsto WHERE id = ?', [treinoPrevistoId]);
    if (!previsto) throw new NaoEncontradoError('Treino previsto', treinoPrevistoId);
  }
  if (treino.treino_previsto_id === treinoPrevistoId) return;

  await banco.transacao(async () => {
    await banco.executar('UPDATE treino_realizado SET treino_previsto_id = ? WHERE id = ?', [treinoPrevistoId, id]);
    await liberarPrevistoSeSemRealizados(banco, treino.treino_previsto_id);
    if (treinoPrevistoId) {
      await banco.executar("UPDATE treino_previsto SET status = 'realizado' WHERE id = ?", [treinoPrevistoId]);
    }
  });
}
