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

// v2: o banco é criptografado com SQLCipher (plugin do expo-sqlite com
// `useSQLCipher`). A chave de 256 bits é gerada no aparelho e fica só no
// SecureStore (Android Keystore) — nunca no banco, no backup ou em log.
const ARQUIVO_ANTIGO = 'corrida.db'; // v1, sem criptografia
const ARQUIVO_CRIPTO = 'corrida-cripto.db';
const CHAVE_DO_BANCO = 'chave_banco_sqlcipher';
const MARCA_MIGRADO = 'banco_criptografado_v1';

// Tabelas conferidas depois da cópia para o arquivo criptografado.
const TABELAS_CONFERIDAS = ['ciclo', 'treino_previsto', 'treino_realizado', 'configuracao'];

let bancoPromise: Promise<Banco> | null = null;

type BancoExpo = Awaited<ReturnType<typeof import('expo-sqlite').openDatabaseAsync>>;

const paraHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function obterChaveDoBanco(): Promise<string> {
  const SecureStore = await import('expo-secure-store');
  const existente = await SecureStore.getItemAsync(CHAVE_DO_BANCO);
  if (existente && /^[0-9a-f]{64}$/.test(existente)) return existente;
  const { getRandomBytes } = await import('expo-crypto');
  const nova = paraHex(getRandomBytes(32));
  await SecureStore.setItemAsync(CHAVE_DO_BANCO, nova);
  return nova;
}

// Chave "crua" em hex: o SQLCipher pula a derivação (PBKDF2), abre rápido.
const pragmaChave = (hex: string) => `"x'${hex}'"`;

async function abrirCriptografado(hex: string): Promise<BancoExpo> {
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(ARQUIVO_CRIPTO);
  await db.execAsync(`PRAGMA key = ${pragmaChave(hex)};`);
  await db.getFirstAsync('SELECT count(*) FROM sqlite_master'); // falha aqui se a chave estiver errada
  return db;
}

async function contar(db: BancoExpo, prefixo = ''): Promise<Record<string, number>> {
  const contagens: Record<string, number> = {};
  for (const tabela of TABELAS_CONFERIDAS) {
    const existe = await db.getFirstAsync<{ n: number }>(
      `SELECT count(*) AS n FROM ${prefixo}sqlite_master WHERE type = 'table' AND name = ?`,
      [tabela],
    );
    if (!existe?.n) continue;
    // Nome de tabela vem da lista fixa acima.
    const linha = await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${prefixo}${tabela}`);
    contagens[tabela] = linha?.n ?? 0;
  }
  return contagens;
}

// Copia o banco antigo (sem criptografia) para o arquivo criptografado com
// sqlcipher_export, confere as contagens e só então apaga o antigo. Se
// qualquer passo falhar, o antigo fica intacto e o app segue usando ele.
async function migrarParaCriptografado(hex: string): Promise<BancoExpo> {
  const SQLite = await import('expo-sqlite');
  const SecureStore = await import('expo-secure-store');
  const antigo = await SQLite.openDatabaseAsync(ARQUIVO_ANTIGO);
  const pasta = String(SQLite.defaultDatabaseDirectory).replace(/^file:\/\//, '');
  try {
    await SQLite.deleteDatabaseAsync(ARQUIVO_CRIPTO).catch(() => undefined); // sobra de tentativa anterior
    await antigo.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    const versao = (await antigo.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    const esperado = await contar(antigo);
    await antigo.execAsync(`ATTACH DATABASE '${pasta}/${ARQUIVO_CRIPTO}' AS cripto KEY ${pragmaChave(hex)};`);
    await antigo.execAsync(`SELECT sqlcipher_export('cripto'); PRAGMA cripto.user_version = ${Number(versao)};`);
    const copiado = await contar(antigo, 'cripto.');
    await antigo.execAsync('DETACH DATABASE cripto;');
    if (JSON.stringify(copiado) !== JSON.stringify(esperado)) throw new Error('Cópia criptografada incompleta');
  } catch (erro) {
    await antigo.closeAsync().catch(() => undefined);
    await SQLite.deleteDatabaseAsync(ARQUIVO_CRIPTO).catch(() => undefined);
    throw erro;
  }
  await antigo.closeAsync();
  const db = await abrirCriptografado(hex);
  await SecureStore.setItemAsync(MARCA_MIGRADO, '1');
  await SQLite.deleteDatabaseAsync(ARQUIVO_ANTIGO).catch(() => undefined);
  return db;
}

async function abrirSemCriptografia(): Promise<BancoExpo> {
  const SQLite = await import('expo-sqlite');
  return SQLite.openDatabaseAsync(ARQUIVO_ANTIGO);
}

async function abrirExpoSqlite(): Promise<Banco> {
  // Imports dinâmicos: os testes nunca carregam os módulos nativos.
  const SecureStore = await import('expo-secure-store');
  const hex = await obterChaveDoBanco();
  let db: BancoExpo;
  if ((await SecureStore.getItemAsync(MARCA_MIGRADO)) === '1') {
    db = await abrirCriptografado(hex);
  } else {
    try {
      db = await migrarParaCriptografado(hex);
    } catch {
      // Ex: APK antigo sem SQLCipher. Nada se perde: segue no arquivo antigo
      // e tenta de novo na próxima abertura.
      db = await abrirSemCriptografia();
    }
  }
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
