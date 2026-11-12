import { obterBanco, ValorSql } from '../db/banco';
import { TABELAS_BACKUP, VERSAO_ESQUEMA } from '../db/esquema';

// Backup manual: um JSON com todas as linhas das tabelas de dados. A chave
// da Garmin (SecureStore) e as preferências não entram — o arquivo não
// carrega nenhum segredo.

const FORMATO = 'corrida-app-backup';
const VERSAO_FORMATO = 1;

export interface Backup {
  formato: typeof FORMATO;
  versao: number;
  esquema: number;
  geradoEm: string;
  tabelas: Record<string, Record<string, ValorSql>[]>;
}

export interface ResumoBackup {
  ciclos: number;
  treinosPrevistos: number;
  treinosRealizados: number;
}

export async function gerarBackup(): Promise<Backup> {
  const banco = await obterBanco();
  const tabelas: Backup['tabelas'] = {};
  for (const [tabela, colunas] of Object.entries(TABELAS_BACKUP)) {
    // Nomes vêm da lista fixa TABELAS_BACKUP, nunca de entrada externa.
    tabelas[tabela] = await banco.todos(`SELECT ${colunas.join(', ')} FROM ${tabela}`);
  }
  return { formato: FORMATO, versao: VERSAO_FORMATO, esquema: VERSAO_ESQUEMA, geradoEm: new Date().toISOString(), tabelas };
}

export function resumirBackup(backup: Backup): ResumoBackup {
  return {
    ciclos: backup.tabelas.ciclo?.length ?? 0,
    treinosPrevistos: backup.tabelas.treino_previsto?.length ?? 0,
    treinosRealizados: backup.tabelas.treino_realizado?.length ?? 0,
  };
}

function ehValorSql(valor: unknown): valor is ValorSql {
  return valor === null || typeof valor === 'string' || (typeof valor === 'number' && Number.isFinite(valor));
}

// Valida a estrutura inteira antes de tocar no banco.
export function lerBackup(json: string): Backup {
  let dados: unknown;
  try {
    dados = JSON.parse(json);
  } catch {
    throw new Error('Arquivo de backup inválido (não é JSON)');
  }
  const backup = dados as Partial<Backup> | null;
  if (!backup || backup.formato !== FORMATO || typeof backup.tabelas !== 'object' || backup.tabelas === null) {
    throw new Error('Este arquivo não é um backup do Corrida App');
  }
  if (backup.versao !== VERSAO_FORMATO) throw new Error(`Versão de backup não suportada: ${String(backup.versao)}`);
  if (typeof backup.esquema !== 'number' || backup.esquema > VERSAO_ESQUEMA) {
    throw new Error('Backup gerado por uma versão mais nova do app — atualize o app antes de restaurar');
  }

  for (const [tabela, linhas] of Object.entries(backup.tabelas)) {
    const colunas = TABELAS_BACKUP[tabela];
    if (!colunas) throw new Error(`Tabela desconhecida no backup: ${tabela}`);
    if (!Array.isArray(linhas)) throw new Error(`Tabela ${tabela} inválida no backup`);
    for (const linha of linhas as unknown[]) {
      if (typeof linha !== 'object' || linha === null) throw new Error(`Linha inválida em ${tabela}`);
      for (const [coluna, valor] of Object.entries(linha)) {
        if (!colunas.includes(coluna)) throw new Error(`Coluna desconhecida ${tabela}.${coluna}`);
        if (!ehValorSql(valor)) throw new Error(`Valor inválido em ${tabela}.${coluna}`);
      }
    }
  }
  return backup as Backup;
}

// Ordem de remoção: filhos antes dos pais.
const ORDEM_REMOCAO = [
  'treino_metricas',
  'treino_realizado_intervalo',
  'treino_realizado',
  'treino_previsto_intervalo',
  'treino_previsto',
  'prova',
  'semana',
  'importacao',
  'ciclo',
];

// Substitui TODOS os dados pelos do backup, numa transação: se qualquer
// linha falhar, nada é alterado.
export async function restaurarBackup(json: string): Promise<ResumoBackup> {
  const backup = lerBackup(json);
  const banco = await obterBanco();
  await banco.transacao(async () => {
    for (const tabela of ORDEM_REMOCAO) {
      await banco.executar(`DELETE FROM ${tabela}`);
    }
    // TABELAS_BACKUP já está na ordem de inserção (pais antes dos filhos).
    for (const [tabela, colunasPermitidas] of Object.entries(TABELAS_BACKUP)) {
      for (const linha of backup.tabelas[tabela] ?? []) {
        // Coluna nula fica de fora do INSERT: vale o DEFAULT da tabela (ex:
        // sensacoes '[]'), e colunas que aceitam nulo continuam nulas.
        const colunas = colunasPermitidas.filter((coluna) => coluna in linha && linha[coluna] !== null);
        await banco.executar(
          `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`,
          colunas.map((coluna) => linha[coluna]),
        );
      }
    }
  });
  return resumirBackup(backup);
}

export function nomeArquivoBackup(data = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `corrida-backup-${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}-${p(data.getHours())}${p(data.getMinutes())}.json`;
}
