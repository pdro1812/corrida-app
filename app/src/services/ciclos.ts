import { obterBanco } from '../db/banco';
import { Ciclo, StatusCiclo } from '../types/modelo';
import {
  agoraIso,
  agruparPor,
  LinhaCiclo,
  LinhaProva,
  NaoEncontradoError,
  novoId,
  paraCiclo,
  paraProva,
  soData,
} from './linhas';

async function comProvas(linhas: LinhaCiclo[]): Promise<Ciclo[]> {
  if (linhas.length === 0) return [];
  const banco = await obterBanco();
  const provas = await banco.todos<LinhaProva>(
    'SELECT * FROM prova WHERE ciclo_id IS NOT NULL ORDER BY data',
  );
  const porCiclo = agruparPor(provas, (p) => p.ciclo_id ?? '');
  return linhas.map((l) => paraCiclo(l, (porCiclo.get(l.id) ?? []).map(paraProva)));
}

export async function listarCiclos(status?: StatusCiclo): Promise<Ciclo[]> {
  const banco = await obterBanco();
  const linhas = status
    ? await banco.todos<LinhaCiclo>('SELECT * FROM ciclo WHERE status = ? ORDER BY data_inicio DESC', [status])
    : await banco.todos<LinhaCiclo>('SELECT * FROM ciclo ORDER BY data_inicio DESC');
  return comProvas(linhas);
}

export async function buscarCicloAtivo(): Promise<Ciclo | null> {
  return (await listarCiclos('ativo'))[0] ?? null;
}

export async function buscarCiclo(id: string): Promise<Ciclo> {
  const banco = await obterBanco();
  const linha = await banco.primeiro<LinhaCiclo>('SELECT * FROM ciclo WHERE id = ?', [id]);
  if (!linha) throw new NaoEncontradoError('Ciclo', id);
  return (await comProvas([linha]))[0];
}

export interface DadosCiclo {
  nome: string;
  dataInicio: string;
  dataFim: string;
  provaNome?: string;
  provaData?: string;
  provaDistanciaKm?: number;
  provaMetaTempoSegundos?: number;
}

// A prova alvo nasce junto com o ciclo (ver docs/DATA_MODEL.md).
export async function criarCiclo(dados: DadosCiclo): Promise<Ciclo> {
  const { provaNome, provaData } = dados;
  if (!provaNome || !provaData) throw new Error('Informe o nome e a data da prova alvo');
  const banco = await obterBanco();
  const id = novoId();
  await banco.transacao(async () => {
    await banco.executar(
      'INSERT INTO ciclo (id, nome, data_inicio, data_fim, status, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      [id, dados.nome.trim(), soData(dados.dataInicio), soData(dados.dataFim), 'ativo', agoraIso()],
    );
    await banco.executar(
      `INSERT INTO prova (id, ciclo_id, tipo, nome, data, distancia_km, meta_tempo_segundos)
       VALUES (?, ?, 'alvo', ?, ?, ?, ?)`,
      [
        novoId(),
        id,
        provaNome.trim(),
        soData(provaData),
        dados.provaDistanciaKm ?? null,
        dados.provaMetaTempoSegundos ?? null,
      ],
    );
  });
  return buscarCiclo(id);
}

export async function atualizarCiclo(
  id: string,
  dados: Partial<DadosCiclo> & { status?: StatusCiclo },
): Promise<Ciclo> {
  const atual = await buscarCiclo(id);
  const banco = await obterBanco();
  await banco.transacao(async () => {
    await banco.executar('UPDATE ciclo SET nome = ?, data_inicio = ?, data_fim = ?, status = ? WHERE id = ?', [
      dados.nome?.trim() ?? atual.nome,
      dados.dataInicio ? soData(dados.dataInicio) : atual.dataInicio,
      dados.dataFim ? soData(dados.dataFim) : atual.dataFim,
      dados.status ?? atual.status,
      id,
    ]);
    const alvo = atual.provas.find((p) => p.tipo === 'alvo');
    if (alvo) {
      await banco.executar(
        'UPDATE prova SET nome = ?, data = ?, distancia_km = ?, meta_tempo_segundos = ? WHERE id = ?',
        [
          dados.provaNome?.trim() ?? alvo.nome,
          dados.provaData ? soData(dados.provaData) : alvo.data,
          dados.provaDistanciaKm !== undefined ? dados.provaDistanciaKm : alvo.distanciaKm,
          dados.provaMetaTempoSegundos !== undefined ? dados.provaMetaTempoSegundos : alvo.metaTempoSegundos,
          alvo.id,
        ],
      );
    }
  });
  return buscarCiclo(id);
}

// Cascata: semanas, treinos previstos, importações e provas do ciclo. Os
// treinos realizados ficam (só perdem o vínculo).
export async function excluirCiclo(id: string): Promise<void> {
  await buscarCiclo(id);
  const banco = await obterBanco();
  await banco.executar('DELETE FROM ciclo WHERE id = ?', [id]);
}
