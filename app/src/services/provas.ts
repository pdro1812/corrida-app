import { obterBanco } from '../db/banco';
import { Prova, TipoProva } from '../types/modelo';
import { LinhaProva, NaoEncontradoError, novoId, paraProva, soData } from './linhas';

export async function listarProvas(cicloId: string): Promise<Prova[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaProva>('SELECT * FROM prova WHERE ciclo_id = ? ORDER BY data', [cicloId]);
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

// A prova alvo é criada junto com o ciclo — aqui só entram secundárias,
// exceto se o ciclo ficou sem alvo.
export async function criarProva(cicloId: string, dados: DadosProva): Promise<Prova> {
  const banco = await obterBanco();
  const tipo = dados.tipo ?? 'secundaria';
  if (tipo === 'alvo') {
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
  if (prova.tipo === 'alvo') {
    throw new Error('Não é possível excluir a prova alvo do ciclo — edite-a na tela de edição do ciclo.');
  }
  const banco = await obterBanco();
  await banco.executar('DELETE FROM prova WHERE id = ?', [provaId]);
}
