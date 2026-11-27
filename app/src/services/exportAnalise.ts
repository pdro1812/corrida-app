import { Banco, obterBanco } from '../db/banco';
import { EntradaAnalise, ESQUEMA_ANALISE, montarTabelasAnalise, TABELAS_ANALISE } from '../dominio/bancoAnalise';
import { gravarConfiguracao, lerConfiguracao } from './configuracoes';
import { montarEntradaExport } from './exportIa';
import { listarRecordes } from './recordes';

// Banco de análise: um SQLite à parte, sem criptografia, só com dados de
// análise, para a IA consultar com SQL (ver dominio/bancoAnalise.ts). O
// arquivo é gerado aqui e salvo na pasta que o usuário escolher.

const CONFIG_OBSERVACOES = 'perfil_observacoes';
export const ARQUIVO_ANALISE = 'corrida-analise.db';

export async function lerObservacoes(): Promise<string> {
  return (await lerConfiguracao(CONFIG_OBSERVACOES)) ?? '';
}

export async function salvarObservacoes(texto: string): Promise<void> {
  if (texto.length > 4000) throw new Error('Observações muito longas (máx. 4000 caracteres)');
  await gravarConfiguracao(CONFIG_OBSERVACOES, texto.trim());
}

export async function montarEntradaAnalise(agora = new Date()): Promise<EntradaAnalise> {
  const base = await montarEntradaExport(null, agora);
  const banco = await obterBanco();
  const ciclos = await banco.todos<{ id: string; nome: string; data_inicio: string; data_fim: string; status: string }>(
    'SELECT id, nome, data_inicio, data_fim, status FROM ciclo ORDER BY data_inicio',
  );
  const nomeCiclo = new Map(ciclos.map((c) => [c.id, c.nome]));
  const provas = await banco.todos<{
    ciclo_id: string | null;
    tipo: string;
    nome: string;
    data: string;
    distancia_km: number | null;
    meta_tempo_segundos: number | null;
    resultado_tempo_segundos: number | null;
    concluida: number;
  }>(
    `SELECT ciclo_id, tipo, nome, data, distancia_km, meta_tempo_segundos, resultado_tempo_segundos, concluida
       FROM prova ORDER BY data`,
  );
  const semanas = await banco.todos<{
    ciclo_id: string;
    numero_semana: number;
    data_inicio: string;
    data_fim: string;
    fase: string | null;
    rotina_extra: string | null;
  }>('SELECT ciclo_id, numero_semana, data_inicio, data_fim, fase, rotina_extra FROM semana ORDER BY data_inicio');

  return {
    ...base,
    provas: provas.map((p) => ({
      nome: p.nome,
      tipo: p.tipo,
      data: p.data,
      distanciaKm: p.distancia_km,
      metaTempoSegundos: p.meta_tempo_segundos,
      resultadoTempoSegundos: p.resultado_tempo_segundos,
      concluida: Boolean(p.concluida),
      ciclo: p.ciclo_id ? (nomeCiclo.get(p.ciclo_id) ?? null) : null,
    })),
    recordes: (await listarRecordes()).map((r) => ({
      distanciaKm: r.distanciaKm,
      tempoSegundos: r.tempoSegundos,
      data: r.data,
      descricao: r.descricao,
    })),
    ciclos: ciclos.map((c) => ({ id: c.id, nome: c.nome, dataInicio: c.data_inicio, dataFim: c.data_fim, status: c.status })),
    semanas: semanas.map((s) => ({
      ciclo: nomeCiclo.get(s.ciclo_id) ?? s.ciclo_id,
      numero: s.numero_semana,
      dataInicio: s.data_inicio,
      dataFim: s.data_fim,
      fase: s.fase,
      rotinaExtra: s.rotina_extra,
    })),
    observacoes: (await lerObservacoes()) || null,
  };
}

export interface ResumoAnalise {
  treinos: number;
  dias: number;
  blocos: number;
}

// Cria as tabelas e grava as linhas no banco de destino (vazio), numa
// transação. Nomes de tabela e coluna vêm de listas fixas do domínio.
export async function escreverBancoAnalise(destino: Banco, entrada: EntradaAnalise): Promise<ResumoAnalise> {
  const tabelas = montarTabelasAnalise(entrada);
  await destino.transacao(async () => {
    for (const ddl of ESQUEMA_ANALISE) await destino.executar(ddl);
    for (const nome of TABELAS_ANALISE) {
      const { colunas, linhas } = tabelas[nome];
      const sql = `INSERT INTO ${nome} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`;
      for (const linha of linhas) await destino.executar(sql, linha);
    }
  });
  return { treinos: tabelas.treino.linhas.length, dias: tabelas.dia.linhas.length, blocos: tabelas.bloco.linhas.length };
}

// No aparelho: cria o arquivo SQLite sem criptografia (nenhuma chave é
// aplicada), grava, fecha e devolve os bytes. O arquivo temporário é
// apagado antes e depois.
export async function gerarArquivoAnalise(agora = new Date()): Promise<{ bytes: Uint8Array; resumo: ResumoAnalise }> {
  const SQLite = await import('expo-sqlite');
  const { File } = await import('expo-file-system');
  const entrada = await montarEntradaAnalise(agora);
  await SQLite.deleteDatabaseAsync(ARQUIVO_ANALISE).catch(() => undefined);
  const db = await SQLite.openDatabaseAsync(ARQUIVO_ANALISE);
  let resumo: ResumoAnalise;
  try {
    // Um arquivo só (sem -wal), para ser copiado inteiro.
    await db.execAsync('PRAGMA journal_mode = DELETE;');
    const destino: Banco = {
      executar: async (sql, params = []) => {
        await db.runAsync(sql, params);
      },
      todos: (sql, params = []) => db.getAllAsync(sql, params),
      primeiro: (sql, params = []) => db.getFirstAsync(sql, params),
      transacao: (fn) => db.withTransactionAsync(fn),
    };
    resumo = await escreverBancoAnalise(destino, entrada);
  } finally {
    await db.closeAsync();
  }
  const pasta = String(SQLite.defaultDatabaseDirectory).replace(/\/$/, '');
  const arquivo = new File(`${pasta.startsWith('file://') ? pasta : `file://${pasta}`}/${ARQUIVO_ANALISE}`);
  const bytes = await arquivo.bytes();
  await SQLite.deleteDatabaseAsync(ARQUIVO_ANALISE).catch(() => undefined);
  return { bytes, resumo };
}
