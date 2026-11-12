import { aplicarMigracoes } from './esquema';

// Valores aceitos como parâmetro de SQL (expo-sqlite e node:sqlite).
export type ValorSql = string | number | null;

// Interface mínima sobre o SQLite — permite rodar os serviços contra o
// expo-sqlite no app e contra o node:sqlite nos testes (ver
// test/bancoDeTeste.ts), sem os serviços conhecerem a implementação.
export interface Banco {
  executar(sql: string, params?: ValorSql[]): Promise<void>;
  todos<T>(sql: string, params?: ValorSql[]): Promise<T[]>;
  primeiro<T>(sql: string, params?: ValorSql[]): Promise<T | null>;
  // Executa `fn` dentro de BEGIN/COMMIT, com ROLLBACK em caso de erro.
  transacao(fn: () => Promise<void>): Promise<void>;
}

const NOME_ARQUIVO = 'corrida.db';

let bancoPromise: Promise<Banco> | null = null;

async function abrirExpoSqlite(): Promise<Banco> {
  // Import dinâmico: os testes nunca carregam o módulo nativo.
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(NOME_ARQUIVO);
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  const banco: Banco = {
    executar: async (sql, params = []) => {
      await db.runAsync(sql, params);
    },
    todos: (sql, params = []) => db.getAllAsync(sql, params),
    primeiro: (sql, params = []) => db.getFirstAsync(sql, params),
    transacao: (fn) => db.withTransactionAsync(fn),
  };
  await aplicarMigracoes(banco);
  return banco;
}

export function obterBanco(): Promise<Banco> {
  if (!bancoPromise) {
    bancoPromise = abrirExpoSqlite().catch((erro: unknown) => {
      bancoPromise = null; // permite tentar de novo na próxima chamada
      throw erro;
    });
  }
  return bancoPromise;
}

// Só para testes: injeta um banco em memória no lugar do expo-sqlite.
export function definirBanco(banco: Banco | null): void {
  bancoPromise = banco ? Promise.resolve(banco) : null;
}
