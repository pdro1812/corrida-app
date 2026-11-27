import type { Banco } from './banco';

// Esquema do SQLite local (ver docs/DATA_MODEL.md). Mesmos nomes de tabela e
// coluna do antigo Postgres — o backup e a migração de dados dependem disso.
// Datas de calendário ficam como TEXT 'YYYY-MM-DD'; criado_em em ISO 8601.
//
// Cada item é uma migração; a posição no array é a versão (PRAGMA
// user_version). Nunca editar uma migração já publicada — só acrescentar.
const MIGRACOES: string[] = [
  `
  CREATE TABLE ciclo (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    data_inicio TEXT NOT NULL,
    data_fim TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo',
    criado_em TEXT NOT NULL
  );
  CREATE TABLE importacao (
    id TEXT PRIMARY KEY,
    ciclo_id TEXT NOT NULL REFERENCES ciclo(id) ON DELETE CASCADE,
    nome_arquivo TEXT,
    semanas_criadas INTEGER NOT NULL,
    treinos_criados INTEGER NOT NULL,
    linhas_com_erro INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  );
  CREATE TABLE semana (
    id TEXT PRIMARY KEY,
    ciclo_id TEXT NOT NULL REFERENCES ciclo(id) ON DELETE CASCADE,
    numero_semana INTEGER NOT NULL,
    data_inicio TEXT NOT NULL,
    data_fim TEXT NOT NULL,
    fase TEXT,
    rotina_extra TEXT
  );
  CREATE INDEX semana_ciclo ON semana(ciclo_id);
  CREATE TABLE prova (
    id TEXT PRIMARY KEY,
    ciclo_id TEXT REFERENCES ciclo(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'alvo',
    nome TEXT NOT NULL,
    data TEXT NOT NULL,
    distancia_km REAL,
    meta_tempo_segundos INTEGER,
    resultado_tempo_segundos INTEGER,
    resultado_pace TEXT,
    concluida INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE treino_previsto (
    id TEXT PRIMARY KEY,
    semana_id TEXT NOT NULL REFERENCES semana(id) ON DELETE CASCADE,
    importacao_id TEXT REFERENCES importacao(id) ON DELETE CASCADE,
    dia_semana TEXT NOT NULL,
    data TEXT NOT NULL,
    tipo TEXT,
    descricao TEXT NOT NULL,
    distancia_alvo_km REAL,
    duracao_alvo_segundos INTEGER,
    pace_alvo_min TEXT,
    pace_alvo_max TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    motivo_nao_realizado TEXT
  );
  CREATE INDEX treino_previsto_data ON treino_previsto(data);
  CREATE INDEX treino_previsto_semana ON treino_previsto(semana_id);
  CREATE TABLE treino_previsto_intervalo (
    id TEXT PRIMARY KEY,
    treino_previsto_id TEXT NOT NULL REFERENCES treino_previsto(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    repeticao_numero INTEGER,
    distancia_alvo_km REAL,
    duracao_alvo_segundos INTEGER,
    pace_alvo_min TEXT,
    pace_alvo_max TEXT
  );
  CREATE INDEX treino_previsto_intervalo_treino ON treino_previsto_intervalo(treino_previsto_id);
  CREATE TABLE treino_realizado (
    id TEXT PRIMARY KEY,
    treino_previsto_id TEXT REFERENCES treino_previsto(id) ON DELETE SET NULL,
    garmin_activity_id TEXT UNIQUE,
    fonte TEXT NOT NULL DEFAULT 'garmin',
    data TEXT NOT NULL,
    distancia_km REAL,
    duracao_segundos INTEGER,
    pace_medio TEXT,
    fc_media INTEGER,
    fc_max INTEGER,
    elevacao_m REAL,
    rpe INTEGER,
    sensacoes TEXT NOT NULL DEFAULT '[]',
    feedback_texto TEXT,
    observacoes TEXT,
    criado_em TEXT NOT NULL
  );
  CREATE INDEX treino_realizado_data ON treino_realizado(data);
  CREATE INDEX treino_realizado_previsto ON treino_realizado(treino_previsto_id);
  CREATE TABLE treino_realizado_intervalo (
    id TEXT PRIMARY KEY,
    treino_realizado_id TEXT NOT NULL REFERENCES treino_realizado(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    repeticao_numero INTEGER,
    tempo_segundos INTEGER,
    distancia_km REAL,
    pace_medio TEXT,
    fc_media INTEGER
  );
  CREATE INDEX treino_realizado_intervalo_treino ON treino_realizado_intervalo(treino_realizado_id);
  CREATE TABLE configuracao (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
];

export const VERSAO_ESQUEMA = MIGRACOES.length;

// Tabelas que entram no backup, na ordem de inserção (pais antes dos
// filhos), com a lista fechada de colunas — o restore só aceita essas
// colunas, então um JSON adulterado não consegue injetar SQL.
export const TABELAS_BACKUP: Record<string, readonly string[]> = {
  ciclo: ['id', 'nome', 'data_inicio', 'data_fim', 'status', 'criado_em'],
  importacao: ['id', 'ciclo_id', 'nome_arquivo', 'semanas_criadas', 'treinos_criados', 'linhas_com_erro', 'criado_em'],
  semana: ['id', 'ciclo_id', 'numero_semana', 'data_inicio', 'data_fim', 'fase', 'rotina_extra'],
  prova: [
    'id', 'ciclo_id', 'tipo', 'nome', 'data', 'distancia_km', 'meta_tempo_segundos',
    'resultado_tempo_segundos', 'resultado_pace', 'concluida',
  ],
  treino_previsto: [
    'id', 'semana_id', 'importacao_id', 'dia_semana', 'data', 'tipo', 'descricao', 'distancia_alvo_km',
    'duracao_alvo_segundos', 'pace_alvo_min', 'pace_alvo_max', 'status', 'motivo_nao_realizado',
  ],
  treino_previsto_intervalo: [
    'id', 'treino_previsto_id', 'ordem', 'tipo', 'repeticao_numero', 'distancia_alvo_km',
    'duracao_alvo_segundos', 'pace_alvo_min', 'pace_alvo_max',
  ],
  treino_realizado: [
    'id', 'treino_previsto_id', 'garmin_activity_id', 'fonte', 'data', 'distancia_km', 'duracao_segundos',
    'pace_medio', 'fc_media', 'fc_max', 'elevacao_m', 'rpe', 'sensacoes', 'feedback_texto', 'observacoes',
    'criado_em',
  ],
  treino_realizado_intervalo: [
    'id', 'treino_realizado_id', 'ordem', 'tipo', 'repeticao_numero', 'tempo_segundos', 'distancia_km',
    'pace_medio', 'fc_media',
  ],
};

// Divide um bloco de migração em comandos — os drivers executam um por vez.
function comandos(bloco: string): string[] {
  return bloco
    .split(';')
    .map((comando) => comando.trim())
    .filter(Boolean);
}

export async function aplicarMigracoes(banco: Banco): Promise<void> {
  const linha = await banco.primeiro<{ user_version: number }>('PRAGMA user_version');
  const versaoAtual = linha?.user_version ?? 0;

  for (let versao = versaoAtual; versao < MIGRACOES.length; versao++) {
    await banco.transacao(async () => {
      for (const comando of comandos(MIGRACOES[versao])) {
        await banco.executar(comando);
      }
      // PRAGMA não aceita parâmetro — o valor é um inteiro controlado aqui.
      await banco.executar(`PRAGMA user_version = ${versao + 1}`);
    });
  }
}
