import { obterBanco } from '../db/banco';
import { Prova, TipoProva } from '../types/modelo';
import { LinhaProva, NaoEncontradoError, novoId, paraProva, soData } from './linhas';

export async function listarProvas(cicloId: string): Promise<Prova[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaProva>('SELECT * FROM prova WHERE ciclo_id = ? ORDER BY data', [cicloId]);
  return linhas.map(paraProva);
}

// Calendário de provas: todas, de qualquer ciclo ou sem ciclo (ex.: o
// próximo objetivo depois da prova alvo atual).
export interface ProvaDoCalendario extends Prova {
  cicloNome: string | null;
}

export async function listarCalendarioProvas(): Promise<ProvaDoCalendario[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaProva & { ciclo_nome: string | null }>(
    'SELECT p.*, c.nome AS ciclo_nome FROM prova p LEFT JOIN ciclo c ON c.id = p.ciclo_id ORDER BY p.data',
  );
  return linhas.map((l) => ({ ...paraProva(l), cicloNome: l.ciclo_nome }));
}

// Provas ainda sem ciclo, que podem virar a prova alvo de um ciclo novo.
export async function listarProvasSemCiclo(): Promise<Prova[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaProva>('SELECT * FROM prova WHERE ciclo_id IS NULL AND concluida = 0 ORDER BY data');
  return linhas.map(paraProva);
}

async function buscarProva(id: string): Promise<Prova> {
  const banco = await obterBanco();
  const linha = await banco.primeiro<LinhaProva>('SELECT * FROM prova WHERE id = ?', [id]);
  if (!linha) throw new NaoEncontradoError('Prova', id);
  return paraProva(linha);
}

export interface DadosProva {
  nome: string;
  data: string;
  tipo?: TipoProva;
  distanciaKm?: number;
  metaTempoSegundos?: number;
}

// Com ciclo: a prova alvo nasce junto com o ciclo, então aqui só entram
// secundárias (exceto se o ciclo ficou sem alvo). Sem ciclo: qualquer tipo;
// uma prova "alvo" sem ciclo é um objetivo futuro, que depois pode virar a
// prova alvo de um ciclo novo.
export async function criarProva(cicloId: string | null, dados: DadosProva): Promise<Prova> {
  const banco = await obterBanco();
  const tipo = dados.tipo ?? 'secundaria';
  if (!dados.nome.trim() || !/^\d{4}-\d{2}-\d{2}/.test(dados.data)) throw new Error('Informe o nome e a data (AAAA-MM-DD)');
  if (tipo === 'alvo' && cicloId) {
    const jaTemAlvo = await banco.primeiro("SELECT id FROM prova WHERE ciclo_id = ? AND tipo = 'alvo'", [cicloId]);
    if (jaTemAlvo) throw new Error('Este ciclo já tem uma prova alvo — edite-a na tela de edição do ciclo.');
  }
  const id = novoId();
  await banco.executar(
    'INSERT INTO prova (id, ciclo_id, tipo, nome, data, distancia_km, meta_tempo_segundos) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, cicloId, tipo, dados.nome.trim(), soData(dados.data), dados.distanciaKm ?? null, dados.metaTempoSegundos ?? null],
  );
  return buscarProva(id);
}

export async function registrarResultadoProva(
  provaId: string,
  dados: { resultadoTempoSegundos: number; resultadoPace?: string },
): Promise<Prova> {
  await buscarProva(provaId);
  const banco = await obterBanco();
  await banco.executar(
    'UPDATE prova SET resultado_tempo_segundos = ?, resultado_pace = ?, concluida = 1 WHERE id = ?',
    [dados.resultadoTempoSegundos, dados.resultadoPace ?? null, provaId],
  );
  return buscarProva(provaId);
}

export async function excluirProva(provaId: string): Promise<void> {
  const prova = await buscarProva(provaId);
  if (prova.tipo === 'alvo' && prova.cicloId) {
    throw new Error('Não é possível excluir a prova alvo do ciclo — edite-a na tela de edição do ciclo.');
  }
  const banco = await obterBanco();
  await banco.executar('DELETE FROM prova WHERE id = ?', [provaId]);
}
