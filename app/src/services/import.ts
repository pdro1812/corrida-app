import { obterBanco } from '../db/banco';
import { LinhaComErro, LinhaPlanilha, parsePlanilhaCsv } from '../dominio/planilhaCsv';
import { extrairDuracaoMinutosDaDescricao, parseTreinoIntervalado } from '../dominio/textoTreino';
import { agoraIso, agruparPor, NaoEncontradoError, novoId } from './linhas';

export interface ResultadoImportacao {
  importacaoId: string;
  semanasCriadas: number;
  semanasReaproveitadas: number;
  treinosCriados: number;
  linhasComErro: LinhaComErro[];
}

export interface Importacao {
  id: string;
  cicloId: string;
  nomeArquivo: string | null;
  semanasCriadas: number;
  treinosCriados: number;
  linhasComErro: number;
  criadoEm: string;
}

interface LinhaImportacao {
  id: string;
  ciclo_id: string;
  nome_arquivo: string | null;
  semanas_criadas: number;
  treinos_criados: number;
  linhas_com_erro: number;
  criado_em: string;
}

export async function listarImportacoes(cicloId: string): Promise<Importacao[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaImportacao>(
    'SELECT * FROM importacao WHERE ciclo_id = ? ORDER BY criado_em DESC',
    [cicloId],
  );
  return linhas.map((l) => ({
    id: l.id,
    cicloId: l.ciclo_id,
    nomeArquivo: l.nome_arquivo,
    semanasCriadas: l.semanas_criadas,
    treinosCriados: l.treinos_criados,
    linhasComErro: l.linhas_com_erro,
    criadoEm: l.criado_em,
  }));
}

// Cascata apaga os treinos previstos (e intervalos) dessa importação. As
// semanas ficam — podem ter treinos de outras importações.
export async function excluirImportacao(id: string): Promise<void> {
  const banco = await obterBanco();
  await banco.executar('DELETE FROM importacao WHERE id = ?', [id]);
}

// RF05: importa a planilha (formato longo) para o ciclo. Tudo numa
// transação — um erro no meio não deixa importação pela metade.
export async function importarPlanilha(
  cicloId: string,
  csv: string,
  nomeArquivo?: string,
): Promise<ResultadoImportacao> {
  const banco = await obterBanco();
  const ciclo = await banco.primeiro('SELECT id FROM ciclo WHERE id = ?', [cicloId]);
  if (!ciclo) throw new NaoEncontradoError('Ciclo', cicloId);

  const { linhas, erros } = parsePlanilhaCsv(csv);
  const importacaoId = novoId();
  let semanasCriadas = 0;
  let semanasReaproveitadas = 0;

  await banco.transacao(async () => {
    await banco.executar(
      `INSERT INTO importacao (id, ciclo_id, nome_arquivo, semanas_criadas, treinos_criados, linhas_com_erro, criado_em)
       VALUES (?, ?, ?, 0, 0, ?, ?)`,
      [importacaoId, cicloId, nomeArquivo ?? null, erros.length, agoraIso()],
    );

    const porSemana = agruparPor<LinhaPlanilha>(linhas, (l) => String(l.semana));
    for (const [numero, linhasDaSemana] of porSemana) {
      const datas = linhasDaSemana.map((l) => l.data).sort();
      const fase = linhasDaSemana.find((l) => l.fase)?.fase ?? null;

      const existente = await banco.primeiro<{ id: string }>(
        'SELECT id FROM semana WHERE ciclo_id = ? AND numero_semana = ?',
        [cicloId, Number(numero)],
      );
      let semanaId = existente?.id;
      if (semanaId) {
        semanasReaproveitadas++;
      } else {
        semanaId = novoId();
        await banco.executar(
          'INSERT INTO semana (id, ciclo_id, numero_semana, data_inicio, data_fim, fase) VALUES (?, ?, ?, ?, ?, ?)',
          [semanaId, cicloId, Number(numero), datas[0], datas[datas.length - 1], fase],
        );
        semanasCriadas++;
      }

      for (const linha of linhasDaSemana) {
        // Treino sem distância alvo (ex: "45 min Leve") só tem a duração no
        // texto — extrai para entrar no km planejado (RF20).
        const minutos =
          linha.distanciaAlvoKm === undefined ? extrairDuracaoMinutosDaDescricao(linha.descricao) : undefined;
        const treinoId = novoId();
        await banco.executar(
          `INSERT INTO treino_previsto (id, semana_id, importacao_id, dia_semana, data, tipo, descricao,
             distancia_alvo_km, duracao_alvo_segundos, pace_alvo_min, pace_alvo_max)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            treinoId,
            semanaId,
            importacaoId,
            linha.diaSemana,
            linha.data,
            linha.tipo ?? null,
            linha.descricao,
            linha.distanciaAlvoKm ?? null,
            minutos ? minutos * 60 : null,
            linha.paceAlvoMin ?? null,
            linha.paceAlvoMax ?? null,
          ],
        );
        for (const intervalo of parseTreinoIntervalado(linha.descricao) ?? []) {
          await banco.executar(
            `INSERT INTO treino_previsto_intervalo (id, treino_previsto_id, ordem, tipo, repeticao_numero,
               distancia_alvo_km, duracao_alvo_segundos)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              novoId(),
              treinoId,
              intervalo.ordem,
              intervalo.tipo,
              intervalo.repeticaoNumero ?? null,
              intervalo.distanciaAlvoKm ?? null,
              intervalo.duracaoAlvoSegundos ?? null,
            ],
          );
        }
      }
    }

    await banco.executar('UPDATE importacao SET semanas_criadas = ?, treinos_criados = ? WHERE id = ?', [
      semanasCriadas,
      linhas.length,
      importacaoId,
    ]);
  });

  return {
    importacaoId,
    semanasCriadas,
    semanasReaproveitadas,
    treinosCriados: linhas.length,
    linhasComErro: erros,
  };
}
