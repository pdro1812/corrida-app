import { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { Banco, definirBanco } from '../src/db/banco';
import { aplicarMigracoes } from '../src/db/esquema';

// Mesmo contrato do expo-sqlite (src/db/banco.ts), sobre o SQLite embutido
// no Node — os serviços rodam nos testes exatamente como no app.
export async function criarBancoDeTeste(): Promise<Banco> {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const banco: Banco = {
    executar: async (sql, params = []) => {
      db.prepare(sql).run(...(params as SQLInputValue[]));
    },
    todos: async <T>(sql: string, params: SQLInputValue[] = []) => db.prepare(sql).all(...params) as T[],
    primeiro: async <T>(sql: string, params: SQLInputValue[] = []) => (db.prepare(sql).get(...params) ?? null) as T | null,
    transacao: async (fn) => {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
      }
    },
  };
  await aplicarMigracoes(banco);
  definirBanco(banco);
  return banco;
}
