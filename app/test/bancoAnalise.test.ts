import { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { Banco } from '../src/db/banco';
import { analisarAtividade, AnaliseTreino } from '../src/dominio/blocosFit';
import { ESQUEMA_ANALISE, montarPerfil, TABELAS_ANALISE } from '../src/dominio/bancoAnalise';
import { gerarBackup } from '../src/services/backup';
import { escreverBancoAnalise, montarEntradaAnalise, salvarObservacoes } from '../src/services/exportAnalise';
import { salvarLimiares } from '../src/services/exportIa';
import { gravarAnalise } from '../src/services/metricas';
import { criarRecorde, lerTempo, listarRecordes } from '../src/services/recordes';
import { criarBancoDeTeste } from './bancoDeTeste';
import { treinoDeTiro } from './fixtures';

// Banco de destino vazio (sem migrações do app), como o arquivo gerado no celular.
function bancoVazio(): { banco: Banco; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
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
  return { banco, db };
}

async function popular() {
  const banco = await criarBancoDeTeste();
  await salvarLimiares('172', '4:50');
  await salvarObservacoes('Musculação seg/qua. Canelite em 2025.');
  await criarRecorde({ distanciaKm: '21.1', tempo: '1:49:10', data: '2026-05-10', descricao: 'Meia de POA' });
  await criarRecorde({ distanciaKm: '10', tempo: '47:30' });
  await banco.executar(
    "INSERT INTO ciclo (id, nome, data_inicio, data_fim, status, criado_em) VALUES ('c', 'Meia SM', '2026-10-01', '2027-01-30', 'ativo', 'x')",
  );
  await banco.executar(
    "INSERT INTO semana (id, ciclo_id, numero_semana, data_inicio, data_fim, fase) VALUES ('s', 'c', 7, '2026-11-16', '2026-11-22', 'específico')",
  );
  await banco.executar(
    "INSERT INTO prova (id, ciclo_id, tipo, nome, data, distancia_km, meta_tempo_segundos, concluida) VALUES ('pa', 'c', 'alvo', 'Meia SM', '2027-01-24', 21.1, 6240, 0)",
  );
  await banco.executar(
    "INSERT INTO prova (id, ciclo_id, tipo, nome, data, distancia_km, concluida) VALUES ('ps', 'c', 'secundaria', '10 km Natal', '2026-12-20', 10, 0)",
  );
  await banco.executar(
    "INSERT INTO treino_previsto (id, semana_id, dia_semana, data, tipo, descricao, status) VALUES ('p1', 's', 'qua', '2026-11-18', 'qualidade', '4x400', 'realizado')",
  );
  await banco.executar(
    "INSERT INTO treino_previsto_intervalo (id, treino_previsto_id, ordem, tipo, repeticao_numero, distancia_alvo_km, pace_alvo_min, pace_alvo_max) VALUES ('i1', 'p1', 1, 'tiro', 1, 0.4, '3:40', '3:50')",
  );
  await banco.executar(
    "INSERT INTO treino_realizado (id, treino_previsto_id, data, distancia_km, duracao_segundos, fc_media, rpe, criado_em) VALUES ('r1', 'p1', '2026-11-18', 4, 1500, 150, 7, 'x')",
  );
  const { amostras, laps } = treinoDeTiro();
  await gravarAnalise(banco, 'r1', analisarAtividade(amostras, laps) as AnaliseTreino);
  await banco.executar(
    "INSERT INTO bem_estar_dia (data, fonte, json, buscado_em) VALUES ('2026-11-18', 'sono', '{\"sleepTimeSeconds\":25200}', 'x')",
  );
  return banco;
}

describe('recordes pessoais', () => {
  it('valida e lê tempos', async () => {
    expect(lerTempo('1:45:30')).toBe(6330);
    expect(lerTempo('19:59')).toBe(1199);
    expect(lerTempo('1:75')).toBeNull();
    expect(lerTempo('45')).toBeNull();
    await criarBancoDeTeste();
    await expect(criarRecorde({ distanciaKm: 'x', tempo: '20:00' })).rejects.toThrow('distância');
    await expect(criarRecorde({ distanciaKm: '5', tempo: '20' })).rejects.toThrow('H:MM:SS');
    await criarRecorde({ distanciaKm: '5,0', tempo: '21:40' });
    expect(await listarRecordes()).toMatchObject([{ distanciaKm: 5, tempoSegundos: 1300 }]);
    expect((await gerarBackup()).tabelas.recorde_pessoal).toHaveLength(1);
  });
});

describe('banco de análise', () => {
  it('gera tabelas, views e leia_me consultáveis', async () => {
    await popular();
    const entrada = await montarEntradaAnalise(new Date('2026-11-20T12:00:00Z'));
    const { banco, db } = bancoVazio();
    const resumo = await escreverBancoAnalise(banco, entrada);
    expect(resumo).toMatchObject({ treinos: 1, dias: 1 });

    const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name").all();
    expect(tabelas.map((t) => t.name)).toEqual(
      expect.arrayContaining([...TABELAS_ANALISE, 'v_treino', 'v_km', 'v_curva_pace_fc', 'v_tiro', 'v_semana']),
    );
    expect(ESQUEMA_ANALISE.join(' ')).not.toMatch(/latitude|longitude|garmin/i);

    const perfil = db.prepare("SELECT texto FROM leia_me WHERE secao = 'perfil'").get() as { texto: string };
    expect(perfil.texto).toContain('**Prova alvo:** Meia SM, 2027-01-24, 21.1 km, meta 1:44:00 (4:56/km)');
    expect(perfil.texto).toContain('semana 7, fase específico');
    expect(perfil.texto).toContain('- 21.1 km: 1:49:10 (5:10/km), 2026-05-10, Meia de POA');
    expect(perfil.texto).toContain('2026-12-20 · 10 km Natal');
    expect(perfil.texto).toContain('Canelite em 2025');

    const tiros = db.prepare('SELECT n, pace_med_s, alvo_min_s, alvo_max_s, fc_pct_limiar FROM v_tiro ORDER BY n').all();
    expect(tiros).toHaveLength(4);
    expect(tiros[0]).toMatchObject({ n: 1, pace_med_s: 222, alvo_min_s: 220, alvo_max_s: 230, fc_pct_limiar: 95.9 });

    const treino = db.prepare('SELECT tipo_previsto, rpe, sono_h, z1_fc_min, fase FROM v_treino').get();
    expect(treino).toMatchObject({ tipo_previsto: 'qualidade', rpe: 7, sono_h: 7, fase: 'específico' });
    expect(db.prepare('SELECT count(*) AS n FROM extra').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT count(*) AS n FROM km').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT semana, treinos FROM v_semana').get()).toEqual({ semana: '2026-11-16', treinos: 1 });
    expect(db.prepare("SELECT valor FROM atleta WHERE chave = 'pace_limiar_s'").get()).toEqual({ valor: '290' });
    expect(db.prepare('SELECT count(*) AS n FROM prova').get()).toEqual({ n: 2 });
  });

  it('perfil sem dados opcionais não quebra', () => {
    const texto = montarPerfil({
      geradoEm: '2026-11-20T00:00:00Z',
      inicio: '2026-11-01',
      fim: '2026-11-20',
      atleta: { fcLimiar: null, paceLimiarS: null, provaAlvo: null },
      bemEstar: [],
      previstos: [],
      realizados: [],
      provas: [],
      recordes: [],
      ciclos: [],
      semanas: [],
      observacoes: null,
    });
    expect(texto).toContain('FC não configurada');
  });
});
