import { obterBanco } from '../db/banco';
import { duracaoAlvoSegundos, estimarKm } from '../dominio/textoTreino';
import { Semana, TreinoPrevisto } from '../types/modelo';
import { agruparPor, NaoEncontradoError } from './linhas';
import { carregarTreinosPrevistos } from './treinos';

interface LinhaSemana {
  id: string;
  ciclo_id: string;
  numero_semana: number;
  data_inicio: string;
  data_fim: string;
  fase: string | null;
  rotina_extra: string | null;
}

// Totais derivados dos treinos previstos, nunca armazenados (ver
// docs/DATA_MODEL.md).
function montarSemana(linha: LinhaSemana, treinos: TreinoPrevisto[]): Semana {
  return {
    id: linha.id,
    cicloId: linha.ciclo_id,
    numeroSemana: linha.numero_semana,
    dataInicio: linha.data_inicio,
    dataFim: linha.data_fim,
    fase: linha.fase,
    rotinaExtra: linha.rotina_extra,
    treinosPrevistos: treinos,
    kmPlanejadoTotal: treinos.reduce((soma, t) => soma + estimarKm(t), 0),
    tempoPlanejadoTotalSegundos: treinos.reduce((soma, t) => soma + duracaoAlvoSegundos(t), 0),
  };
}

export async function listarSemanasDoCiclo(cicloId: string): Promise<Semana[]> {
  const banco = await obterBanco();
  const [linhas, treinos] = await Promise.all([
    banco.todos<LinhaSemana>('SELECT * FROM semana WHERE ciclo_id = ? ORDER BY numero_semana', [cicloId]),
    carregarTreinosPrevistos('semana_id IN (SELECT id FROM semana WHERE ciclo_id = ?)', [cicloId]),
  ]);
  const porSemana = agruparPor(treinos, (t) => t.semanaId);
  return linhas.map((linha) => montarSemana(linha, porSemana.get(linha.id) ?? []));
}

export async function buscarSemana(id: string): Promise<Semana> {
  const banco = await obterBanco();
  const linha = await banco.primeiro<LinhaSemana>('SELECT * FROM semana WHERE id = ?', [id]);
  if (!linha) throw new NaoEncontradoError('Semana', id);
  return montarSemana(linha, await carregarTreinosPrevistos('semana_id = ?', [id]));
}

export async function excluirSemana(id: string): Promise<void> {
  await buscarSemana(id);
  const banco = await obterBanco();
  await banco.executar('DELETE FROM semana WHERE id = ?', [id]);
}
