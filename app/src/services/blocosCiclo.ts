import { obterBanco } from '../db/banco';
import {
  BlocoCicloNovo,
  blocosDasFases,
  gerarBlocosPadrao,
  TipoBloco,
  validarBloco,
} from '../dominio/blocosCiclo';
import { agoraIso, novoId } from './linhas';

export interface BlocoCiclo extends BlocoCicloNovo {
  id: string;
  cicloId: string;
  ordem: number;
  objetivo: string | null;
}

interface LinhaBloco {
  id: string;
  ciclo_id: string;
  ordem: number;
  nome: string;
  tipo: TipoBloco;
  data_inicio: string;
  data_fim: string;
  objetivo: string | null;
}

const paraBloco = (l: LinhaBloco): BlocoCiclo => ({
  id: l.id,
  cicloId: l.ciclo_id,
  ordem: l.ordem,
  nome: l.nome,
  tipo: l.tipo,
  dataInicio: l.data_inicio,
  dataFim: l.data_fim,
  objetivo: l.objetivo,
});

export async function listarBlocos(cicloId: string): Promise<BlocoCiclo[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaBloco>('SELECT * FROM bloco_ciclo WHERE ciclo_id = ? ORDER BY data_inicio, ordem', [
    cicloId,
  ]);
  return linhas.map(paraBloco);
}

function normalizar(dados: BlocoCicloNovo): BlocoCicloNovo {
  const bloco = {
    nome: dados.nome.trim(),
    tipo: dados.tipo,
    dataInicio: dados.dataInicio.trim(),
    dataFim: dados.dataFim.trim(),
    objetivo: dados.objetivo?.trim() || null,
  };
  const erro = validarBloco(bloco);
  if (erro) throw new Error(erro);
  return bloco;
}

export async function criarBloco(cicloId: string, dados: BlocoCicloNovo): Promise<void> {
  const b = normalizar(dados);
  const banco = await obterBanco();
  const ordem = (await banco.primeiro<{ n: number }>('SELECT count(*) AS n FROM bloco_ciclo WHERE ciclo_id = ?', [cicloId]))?.n ?? 0;
  await banco.executar(
    `INSERT INTO bloco_ciclo (id, ciclo_id, ordem, nome, tipo, data_inicio, data_fim, objetivo, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [novoId(), cicloId, ordem + 1, b.nome, b.tipo, b.dataInicio, b.dataFim, b.objetivo ?? null, agoraIso()],
  );
}

export async function atualizarBloco(id: string, dados: BlocoCicloNovo): Promise<void> {
  const b = normalizar(dados);
  const banco = await obterBanco();
  await banco.executar(
    'UPDATE bloco_ciclo SET nome = ?, tipo = ?, data_inicio = ?, data_fim = ?, objetivo = ? WHERE id = ?',
    [b.nome, b.tipo, b.dataInicio, b.dataFim, b.objetivo ?? null, id],
  );
}

export async function excluirBloco(id: string): Promise<void> {
  const banco = await obterBanco();
  await banco.executar('DELETE FROM bloco_ciclo WHERE id = ?', [id]);
}

// Cria os blocos de uma vez (ciclo sem blocos): a partir das fases da
// planilha, se houver, senão a divisão padrão.
export async function gerarBlocosDoCiclo(cicloId: string, origem: 'fases' | 'padrao'): Promise<number> {
  const banco = await obterBanco();
  const ciclo = await banco.primeiro<{ data_inicio: string; data_fim: string }>(
    'SELECT data_inicio, data_fim FROM ciclo WHERE id = ?',
    [cicloId],
  );
  if (!ciclo) throw new Error('Ciclo não encontrado');
  const blocos =
    origem === 'fases'
      ? blocosDasFases(
          (
            await banco.todos<{ data_inicio: string; data_fim: string; fase: string | null }>(
              'SELECT data_inicio, data_fim, fase FROM semana WHERE ciclo_id = ?',
              [cicloId],
            )
          ).map((s) => ({ dataInicio: s.data_inicio, dataFim: s.data_fim, fase: s.fase })),
        )
      : gerarBlocosPadrao(ciclo.data_inicio.slice(0, 10), ciclo.data_fim.slice(0, 10));
  await banco.transacao(async () => {
    await banco.executar('DELETE FROM bloco_ciclo WHERE ciclo_id = ?', [cicloId]);
    for (const [i, b] of blocos.entries()) {
      await banco.executar(
        `INSERT INTO bloco_ciclo (id, ciclo_id, ordem, nome, tipo, data_inicio, data_fim, objetivo, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [novoId(), cicloId, i + 1, b.nome, b.tipo, b.dataInicio, b.dataFim, agoraIso()],
      );
    }
  });
  return blocos.length;
}
