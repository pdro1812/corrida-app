import { AnaliseTreino } from './blocosFit';
import { ResumoBemEstarDia } from './bemEstar';
import { descreverTempo } from './clima';
import { parseEstruturaPrevisto } from './estruturaPrevisto';
import {
  desviosDoDia,
  EntradaExport,
  minutosPorZonaFc,
  minutosPorZonaPace,
  paceSegundos,
  paceTexto,
  tempoTexto,
  zonasFc,
  zonasPace,
} from './exportGrafo';

// Banco de análise: um SQLite à parte, sem criptografia e só com dados de
// análise (sem chave da Garmin, sem coordenadas), feito para a IA consultar
// com SQL só o que cada pergunta precisa. Tabelas "largas" e com unidade no
// nome da coluna; pace sempre em segundos por km. A tabela leia_me leva o
// perfil do atleta, o dicionário e as consultas sugeridas, para uma sessão
// nova começar sem contexto. Lógica pura: gera DDL e linhas.

export const VERSAO_BANCO_ANALISE = 2;

type Valor = string | number | null;

export interface Tabela {
  colunas: string[];
  linhas: Valor[][];
}

export interface ProvaEntrada {
  nome: string;
  tipo: string; // alvo | secundaria
  data: string;
  distanciaKm: number | null;
  metaTempoSegundos: number | null;
  resultadoTempoSegundos: number | null;
  concluida: boolean;
  ciclo: string | null;
}

export interface RecordeEntrada {
  distanciaKm: number;
  tempoSegundos: number;
  data: string | null;
  descricao: string | null;
}

export interface CicloEntrada {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  status: string;
}

export interface SemanaEntrada {
  ciclo: string;
  numero: number;
  dataInicio: string;
  dataFim: string;
  fase: string | null;
  rotinaExtra: string | null;
}

export interface BlocoCicloEntrada {
  ciclo: string;
  ordem: number;
  nome: string;
  tipo: string; // pre_ciclo | base | desenvolvimento | especifico | polimento | transicao
  dataInicio: string;
  dataFim: string;
  objetivo: string | null;
}

export interface EntradaAnalise extends EntradaExport {
  provas: ProvaEntrada[];
  blocosCiclo?: BlocoCicloEntrada[];
  recordes: RecordeEntrada[];
  ciclos: CicloEntrada[];
  semanas: SemanaEntrada[];
  observacoes: string | null; // texto livre do atleta (lesões, objetivos, rotina)
}

// ---------- esquema ----------

export const ESQUEMA_ANALISE: string[] = [
  `CREATE TABLE leia_me (secao TEXT PRIMARY KEY, texto TEXT NOT NULL)`,
  `CREATE TABLE atleta (chave TEXT PRIMARY KEY, valor TEXT)`,
  `CREATE TABLE prova (nome TEXT, tipo TEXT, data TEXT, distancia_km REAL, meta_s INTEGER, meta_pace_s INTEGER,
     resultado_s INTEGER, resultado_pace_s INTEGER, concluida INTEGER, ciclo TEXT)`,
  `CREATE TABLE recorde (distancia_km REAL, tempo_s INTEGER, pace_s INTEGER, data TEXT, origem TEXT)`,
  `CREATE TABLE ciclo (id TEXT PRIMARY KEY, nome TEXT, data_inicio TEXT, data_fim TEXT, status TEXT)`,
  `CREATE TABLE semana (ciclo TEXT, numero INTEGER, data_inicio TEXT, data_fim TEXT, fase TEXT, rotina_extra TEXT)`,
  `CREATE TABLE bloco_ciclo (ciclo TEXT, ordem INTEGER, nome TEXT, tipo TEXT, data_inicio TEXT, data_fim TEXT, objetivo TEXT)`,
  `CREATE TABLE dia (data TEXT PRIMARY KEY, sono_h REAL, sono_nota INTEGER, sono_profundo_min INTEGER,
     sono_rem_min INTEGER, despertares INTEGER, hrv INTEGER, hrv_semana INTEGER, hrv_status TEXT, fc_repouso INTEGER,
     stress INTEGER, stress_sono INTEGER, resp_sono REAL, bb_max INTEGER, bb_min INTEGER, bb_carga INTEGER,
     bb_gasto INTEGER, vo2max REAL, dz_sono REAL, dz_hrv REAL, dz_fc_repouso REAL, dz_stress REAL, dz_bb REAL)`,
  `CREATE TABLE previsto (id TEXT PRIMARY KEY, data TEXT, semana INTEGER, fase TEXT, tipo TEXT, descricao TEXT,
     km_alvo REAL, min_alvo REAL, pace_alvo_min_s INTEGER, pace_alvo_max_s INTEGER, status TEXT, motivo TEXT)`,
  `CREATE TABLE previsto_bloco (previsto_id TEXT, ordem INTEGER, tipo TEXT, km_alvo REAL, s_alvo INTEGER,
     pace_alvo_min_s INTEGER, pace_alvo_max_s INTEGER)`,
  `CREATE TABLE treino (id TEXT PRIMARY KEY, previsto_id TEXT, data TEXT, km REAL, min REAL, pace_medio_s INTEGER,
     fc_media INTEGER, subida_m REAL, rpe INTEGER, sensacoes TEXT, nota TEXT, te_aerobico REAL, te_anaerobico REAL,
     carga REAL, cadencia INTEGER, potencia INTEGER, contato_ms INTEGER, oscilacao_mm REAL, passada_m REAL,
     deriva_sessao_pct REAL, temp_c REAL, sensacao_c REAL, umidade_pct REAL, vento_kmh REAL, chuva_mm REAL,
     condicao TEXT, z1_fc_min INTEGER, z2_fc_min INTEGER, z3_fc_min INTEGER, z4_fc_min INTEGER, z5_fc_min INTEGER,
     z1_pace_min INTEGER, z2_pace_min INTEGER, z3_pace_min INTEGER, z4_pace_min INTEGER, z5_pace_min INTEGER,
     divisao TEXT, carga_srpe INTEGER)`,
  `CREATE TABLE bloco (treino_id TEXT, ordem INTEGER, tipo TEXT, n INTEGER, km REAL, min REAL, pace_p10_s INTEGER,
     pace_med_s INTEGER, pace_p90_s INTEGER, gap_s INTEGER, fc_p10 INTEGER, fc_med INTEGER, fc_p90 INTEGER,
     fc_estavel INTEGER, custo_bat_km INTEGER, deriva_pct REAL, cadencia INTEGER, contato_ms INTEGER, passada_m REAL,
     potencia INTEGER, queda_fc_60s INTEGER)`,
  `CREATE TABLE km (treino_id TEXT, km INTEGER, pace_s INTEGER, fc INTEGER, inclinacao_pct REAL, cadencia INTEGER)`,
  `CREATE TABLE extra (treino_id TEXT, metros INTEGER, pace_s INTEGER, onde TEXT)`,
  `CREATE TABLE hist_fc (treino_id TEXT, bpm INTEGER, segundos INTEGER)`,
  `CREATE TABLE hist_pace (treino_id TEXT, pace_s INTEGER, segundos INTEGER)`,
  `CREATE INDEX idx_bloco_treino ON bloco (treino_id)`,
  `CREATE INDEX idx_km_treino ON km (treino_id)`,
  `CREATE INDEX idx_treino_data ON treino (data)`,
  // Treino com o proposto, o contexto do dia e a semana do ciclo.
  `CREATE VIEW v_treino AS
     SELECT t.*, p.tipo AS tipo_previsto, p.descricao AS descricao_prevista, p.pace_alvo_min_s, p.pace_alvo_max_s,
            p.semana, p.fase,
            (SELECT bc.nome FROM bloco_ciclo bc WHERE t.data BETWEEN bc.data_inicio AND bc.data_fim LIMIT 1) AS bloco_ciclo,
            d.sono_h, d.sono_nota, d.hrv, d.hrv_status, d.fc_repouso, d.stress, d.bb_max,
            d.dz_sono, d.dz_hrv, d.dz_fc_repouso, d.dz_stress, d.dz_bb
       FROM treino t LEFT JOIN previsto p ON p.id = t.previsto_id LEFT JOIN dia d ON d.data = t.data`,
  // Pontos da curva pace -> FC: cada km dos trechos contínuos, com clima e tipo.
  `CREATE VIEW v_km AS
     SELECT k.*, t.data, t.temp_c, t.umidade_pct, p.tipo AS tipo_previsto, (k.pace_s / 10) * 10 AS faixa_pace_s
       FROM km k JOIN treino t ON t.id = k.treino_id LEFT JOIN previsto p ON p.id = t.previsto_id`,
  // Curva agregada por faixa de 10 s/km e mês (só km com FC).
  `CREATE VIEW v_curva_pace_fc AS
     SELECT substr(data, 1, 7) AS mes, faixa_pace_s, count(*) AS n_km, round(avg(fc), 1) AS fc_media,
            round(avg(temp_c), 1) AS temp_media_c
       FROM v_km WHERE fc IS NOT NULL GROUP BY mes, faixa_pace_s`,
  // Cada tiro com o alvo do proposto e a FC estável em % do limiar.
  `CREATE VIEW v_tiro AS
     SELECT b.*, t.data, p.descricao AS descricao_prevista,
            (SELECT min(pb.pace_alvo_min_s) FROM previsto_bloco pb WHERE pb.previsto_id = t.previsto_id AND pb.tipo = 'tiro') AS alvo_min_s,
            (SELECT max(pb.pace_alvo_max_s) FROM previsto_bloco pb WHERE pb.previsto_id = t.previsto_id AND pb.tipo = 'tiro') AS alvo_max_s,
            round(100.0 * b.fc_estavel / (SELECT CAST(valor AS REAL) FROM atleta WHERE chave = 'fc_limiar'), 1) AS fc_pct_limiar,
            t.temp_c, d.dz_hrv, d.dz_sono
       FROM bloco b JOIN treino t ON t.id = b.treino_id LEFT JOIN previsto p ON p.id = t.previsto_id
       LEFT JOIN dia d ON d.data = t.data
      WHERE b.tipo = 'tiro'`,
  // Resumo por semana ISO (segunda-feira).
  `CREATE VIEW v_semana AS
     SELECT s.*, (SELECT bc.nome FROM bloco_ciclo bc WHERE s.inicio BETWEEN bc.data_inicio AND bc.data_fim LIMIT 1) AS bloco_ciclo
       FROM (SELECT date(data, '-' || ((CAST(strftime('%w', data) AS INTEGER) + 6) % 7) || ' days') AS semana,
                    min(data) AS inicio,
                    count(*) AS treinos, round(sum(km), 1) AS km, round(sum(min)) AS min, round(avg(rpe), 1) AS rpe_medio,
                    round(sum(carga)) AS carga, sum(carga_srpe) AS carga_srpe, sum(z1_fc_min) AS z1_min, sum(z2_fc_min) AS z2_min, sum(z3_fc_min) AS z3_min,
                    sum(z4_fc_min) AS z4_min, sum(z5_fc_min) AS z5_min
               FROM treino GROUP BY semana) s`,
  // Resumo por bloco do ciclo (Base, Desenvolvimento...), para comparar blocos.
  `CREATE VIEW v_bloco_ciclo AS
     SELECT bc.ciclo, bc.ordem, bc.nome, bc.tipo, bc.data_inicio, bc.data_fim, bc.objetivo,
            round((julianday(bc.data_fim) - julianday(bc.data_inicio) + 1) / 7.0, 1) AS semanas,
            count(t.id) AS treinos, round(sum(t.km), 1) AS km,
            round(sum(t.km) / ((julianday(bc.data_fim) - julianday(bc.data_inicio) + 1) / 7.0), 1) AS km_semana,
            round(avg(t.rpe), 1) AS rpe_medio, round(avg(t.fc_media)) AS fc_media, round(sum(t.carga)) AS carga,
            sum(t.carga_srpe) AS carga_srpe,
            (SELECT round(avg(b.custo_bat_km)) FROM bloco b JOIN treino t2 ON t2.id = b.treino_id
              WHERE b.tipo = 'continuo' AND t2.data BETWEEN bc.data_inicio AND bc.data_fim) AS custo_continuo_bat_km,
            (SELECT max(t3.km) FROM treino t3 WHERE t3.data BETWEEN bc.data_inicio AND bc.data_fim) AS maior_treino_km
       FROM bloco_ciclo bc LEFT JOIN treino t ON t.data BETWEEN bc.data_inicio AND bc.data_fim
      GROUP BY bc.ciclo, bc.ordem, bc.nome, bc.tipo, bc.data_inicio, bc.data_fim, bc.objetivo`,
];

export const TABELAS_ANALISE = [
  'leia_me', 'atleta', 'prova', 'recorde', 'ciclo', 'semana', 'bloco_ciclo', 'dia', 'previsto', 'previsto_bloco', 'treino', 'bloco',
  'km', 'extra', 'hist_fc', 'hist_pace',
] as const;

// ---------- linhas ----------

const arred = (v: number | null | undefined, casas = 0): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** casas) / 10 ** casas;

const ID_TIPO_PREVISTO: Record<string, string> = {
  aquecimento: 'aq',
  tiro: 'tiro',
  recuperacao: 'trote',
  desaquecimento: 'des',
};

export function linhaDia(dia: ResumoBemEstarDia, todos: ResumoBemEstarDia[]): Valor[] {
  const inicioBase = new Date(`${dia.data}T00:00:00Z`);
  inicioBase.setUTCDate(inicioBase.getUTCDate() - 28);
  const base = todos.filter((d) => d.data < dia.data && d.data >= inicioBase.toISOString().slice(0, 10));
  const dz = desviosDoDia(dia, base) as Record<string, number | undefined>;
  return [
    dia.data, dia.sonoHoras, dia.sonoScore, dia.sonoProfundoMin, dia.sonoRemMin, dia.despertares, dia.hrvNoite,
    dia.hrvSemanal, dia.hrvStatus, dia.fcRepouso, dia.stressMedio, dia.stressSono, dia.respiracaoSono,
    dia.bodyBatteryMax, dia.bodyBatteryMin, dia.bodyBatteryCarregado, dia.bodyBatteryGasto, dia.vo2max,
    dz.sono_h ?? null, dz.hrv ?? null, dz.fc_rep ?? null, dz.stress ?? null, dz.bb ?? null,
  ];
}

function analiseValida(a: AnaliseTreino | null): AnaliseTreino | null {
  return a && a.blocos.length ? a : null;
}

export function montarTabelasAnalise(e: EntradaAnalise): Record<(typeof TABELAS_ANALISE)[number], Tabela> {
  const { fcLimiar, paceLimiarS } = e.atleta;
  const fcRepBase = e.bemEstar
    .filter((b) => b.fcRepouso !== null)
    .map((b) => b.fcRepouso as number)
    .sort((a, b) => a - b);

  const atleta: Valor[][] = [
    ['versao_banco', String(VERSAO_BANCO_ANALISE)],
    ['gerado_em', e.geradoEm.slice(0, 16)],
    ['periodo_inicio', e.inicio],
    ['periodo_fim', e.fim],
    ['fc_limiar', fcLimiar !== null ? String(fcLimiar) : null],
    ['pace_limiar_s', paceLimiarS !== null ? String(paceLimiarS) : null],
    ['fc_repouso_mediana', fcRepBase.length ? String(fcRepBase[Math.floor(fcRepBase.length / 2)]) : null],
    ['zonas_fc_inicio_bpm', fcLimiar ? zonasFc(fcLimiar).join(',') : null],
    ['zonas_pace_limite_lento_s', paceLimiarS ? zonasPace(paceLimiarS).map((v) => v ?? '').join(',') : null],
    ['observacoes', e.observacoes?.trim() || null],
  ];

  const blocos: Valor[][] = [];
  const kms: Valor[][] = [];
  const extras: Valor[][] = [];
  const histFc: Valor[][] = [];
  const histPace: Valor[][] = [];
  const treinos: Valor[][] = e.realizados.map((r) => {
    const a = analiseValida(r.analise);
    const s = r.sessao;
    if (a) {
      let n = 0;
      a.blocos.forEach((b, i) => {
        if (b.tipo === 'tiro') n++;
        blocos.push([
          r.id, i + 1, b.tipo, b.tipo === 'tiro' || b.tipo === 'trote' ? n : null, b.km, b.min, b.pace?.[0] ?? null,
          b.pace?.[1] ?? null, b.pace?.[2] ?? null, b.gap, b.fc?.[0] ?? null, b.fc?.[1] ?? null, b.fc?.[2] ?? null,
          b.fcSs, b.custo, b.derivaPct, b.cad, b.contato, b.passada, b.pot, b.quedaFc60,
        ]);
      });
      for (const [km, pace, fc, incl, cad] of a.seg) kms.push([r.id, km, pace, fc, incl, cad]);
      for (const x of a.extras) extras.push([r.id, x.m, x.paceS, x.onde]);
      for (const [bpm, seg] of Object.entries(a.histFc)) histFc.push([r.id, Number(bpm), seg]);
      for (const [pace, seg] of Object.entries(a.histPace)) histPace.push([r.id, Number(pace), seg]);
    }
    const zFc = a && fcLimiar ? minutosPorZonaFc(a.histFc, fcLimiar) : [null, null, null, null, null];
    const zPace = a && paceLimiarS ? minutosPorZonaPace(a.histPace, paceLimiarS) : [null, null, null, null, null];
    return [
      r.id, r.previstoId, r.data, arred(r.distanciaKm, 2), arred(r.duracaoSegundos ? r.duracaoSegundos / 60 : null, 1),
      paceSegundos(r.paceMedio), r.fcMedia, arred(r.elevacaoM), r.rpe, r.sensacoes.length ? r.sensacoes.join(',') : null,
      r.feedbackTexto?.replace(/\s+/g, ' ').trim() || null, s?.efeitoAerobico ?? null, s?.efeitoAnaerobico ?? null,
      arred(s?.carga), s?.cadencia ?? null, s?.potencia ?? null, s?.contatoMs ?? null, s?.oscilacaoMm ?? null,
      s?.passadaM ?? null, s?.desacoplamentoPct ?? null, arred(s?.temperaturaC, 1), arred(s?.sensacaoTermicaC, 1),
      arred(s?.umidadePct), arred(s?.ventoKmh), arred(s?.precipitacaoMm, 1), s ? descreverTempo(s.codigoTempo) : null,
      ...zFc, ...zPace, a?.divisao ?? null,
      r.rpe !== null && r.duracaoSegundos ? Math.round((r.rpe * r.duracaoSegundos) / 60) : null,
    ];
  });

  const previstoBlocos: Valor[][] = [];
  const previstos: Valor[][] = e.previstos.map((p) => {
    for (const i of [...p.intervalos].sort((a, b) => a.ordem - b.ordem)) {
      previstoBlocos.push([
        p.id, i.ordem, ID_TIPO_PREVISTO[i.tipo] ?? i.tipo, i.distanciaAlvoKm, i.duracaoAlvoSegundos,
        paceSegundos(i.paceAlvoMin), paceSegundos(i.paceAlvoMax),
      ]);
    }
    // Sem intervalos cadastrados: blocos lidos do texto ("3 km aq + 2x12 min...").
    if (p.intervalos.length === 0) {
      (parseEstruturaPrevisto(p.descricao) ?? []).forEach((seg, i) => {
        previstoBlocos.push([
          p.id, i + 1, seg.tipo, seg.metros !== undefined ? seg.metros / 1000 : null, seg.segundos ?? null,
          seg.paceAlvoS?.[0] ?? null, seg.paceAlvoS?.[1] ?? null,
        ]);
      });
    }
    return [
      p.id, p.data, p.semana?.numero ?? null, p.semana?.fase ?? null, p.tipo, p.descricao, p.distanciaAlvoKm,
      arred(p.duracaoAlvoSegundos ? p.duracaoAlvoSegundos / 60 : null, 1), paceSegundos(p.paceAlvoMin),
      paceSegundos(p.paceAlvoMax), p.status, p.motivoNaoRealizado,
    ];
  });

  const pace = (s: number | null, km: number | null) => (s && km ? Math.round(s / km) : null);
  const tabela = (colunasDdl: string, linhas: Valor[][]): Tabela => ({ colunas: colunasDdl.split(','), linhas });

  return {
    leia_me: tabela('secao,texto', montarLeiaMe(e)),
    atleta: tabela('chave,valor', atleta),
    prova: tabela(
      'nome,tipo,data,distancia_km,meta_s,meta_pace_s,resultado_s,resultado_pace_s,concluida,ciclo',
      e.provas.map((p) => [
        p.nome, p.tipo, p.data, p.distanciaKm, p.metaTempoSegundos, pace(p.metaTempoSegundos, p.distanciaKm),
        p.resultadoTempoSegundos, pace(p.resultadoTempoSegundos, p.distanciaKm), p.concluida ? 1 : 0, p.ciclo,
      ]),
    ),
    recorde: tabela(
      'distancia_km,tempo_s,pace_s,data,origem',
      e.recordes.map((r) => [r.distanciaKm, r.tempoSegundos, pace(r.tempoSegundos, r.distanciaKm), r.data, r.descricao]),
    ),
    ciclo: tabela('id,nome,data_inicio,data_fim,status', e.ciclos.map((c) => [c.id, c.nome, c.dataInicio, c.dataFim, c.status])),
    semana: tabela(
      'ciclo,numero,data_inicio,data_fim,fase,rotina_extra',
      e.semanas.map((s) => [s.ciclo, s.numero, s.dataInicio, s.dataFim, s.fase, s.rotinaExtra]),
    ),
    bloco_ciclo: tabela(
      'ciclo,ordem,nome,tipo,data_inicio,data_fim,objetivo',
      (e.blocosCiclo ?? []).map((b) => [b.ciclo, b.ordem, b.nome, b.tipo, b.dataInicio, b.dataFim, b.objetivo]),
    ),
    dia: tabela(
      'data,sono_h,sono_nota,sono_profundo_min,sono_rem_min,despertares,hrv,hrv_semana,hrv_status,fc_repouso,' +
        'stress,stress_sono,resp_sono,bb_max,bb_min,bb_carga,bb_gasto,vo2max,dz_sono,dz_hrv,dz_fc_repouso,dz_stress,dz_bb',
      e.bemEstar.map((d) => linhaDia(d, e.bemEstar)),
    ),
    previsto: tabela(
      'id,data,semana,fase,tipo,descricao,km_alvo,min_alvo,pace_alvo_min_s,pace_alvo_max_s,status,motivo',
      previstos,
    ),
    previsto_bloco: tabela('previsto_id,ordem,tipo,km_alvo,s_alvo,pace_alvo_min_s,pace_alvo_max_s', previstoBlocos),
    treino: tabela(
      'id,previsto_id,data,km,min,pace_medio_s,fc_media,subida_m,rpe,sensacoes,nota,te_aerobico,te_anaerobico,carga,' +
        'cadencia,potencia,contato_ms,oscilacao_mm,passada_m,deriva_sessao_pct,temp_c,sensacao_c,umidade_pct,vento_kmh,' +
        'chuva_mm,condicao,z1_fc_min,z2_fc_min,z3_fc_min,z4_fc_min,z5_fc_min,z1_pace_min,z2_pace_min,z3_pace_min,' +
        'z4_pace_min,z5_pace_min,divisao,carga_srpe',
      treinos,
    ),
    bloco: tabela(
      'treino_id,ordem,tipo,n,km,min,pace_p10_s,pace_med_s,pace_p90_s,gap_s,fc_p10,fc_med,fc_p90,fc_estavel,' +
        'custo_bat_km,deriva_pct,cadencia,contato_ms,passada_m,potencia,queda_fc_60s',
      blocos,
    ),
    km: tabela('treino_id,km,pace_s,fc,inclinacao_pct,cadencia', kms),
    extra: tabela('treino_id,metros,pace_s,onde', extras),
    hist_fc: tabela('treino_id,bpm,segundos', histFc),
    hist_pace: tabela('treino_id,pace_s,segundos', histPace),
  };
}

// ---------- leia_me ----------

const fmtProva = (p: ProvaEntrada) => {
  const partes = [`${p.data} · ${p.nome}`];
  if (p.distanciaKm) partes.push(`${p.distanciaKm} km`);
  if (p.metaTempoSegundos) partes.push(`meta ${tempoTexto(p.metaTempoSegundos)}`);
  if (p.concluida && p.resultadoTempoSegundos) partes.push(`feito em ${tempoTexto(p.resultadoTempoSegundos)}`);
  return `- ${partes.join(' · ')}`;
};

export function montarPerfil(e: EntradaAnalise): string {
  const { fcLimiar, paceLimiarS } = e.atleta;
  const cicloAtivo = e.ciclos.find((c) => c.status === 'ativo');
  const alvo =
    e.provas.find((p) => p.tipo === 'alvo' && !p.concluida && cicloAtivo && p.ciclo === cicloAtivo.nome) ??
    e.provas.find((p) => p.tipo === 'alvo' && !p.concluida) ??
    e.provas.find((p) => p.tipo === 'alvo');
  const proximas = e.provas.filter((p) => p !== alvo && p.data >= e.fim && !p.concluida);
  const feitas = e.provas.filter((p) => p.concluida);
  // Provas futuras com a relação com a prova alvo: antes dela (preparatória)
  // ou depois (próximo objetivo, que pesa no taper e na recuperação).
  const fmtProxima = (p: ProvaEntrada) => {
    const extras = [p.tipo === 'alvo' ? 'alvo de outro ciclo' : p.ciclo ? `secundária do ciclo ${p.ciclo}` : 'sem ciclo'];
    if (alvo) {
      const semanas = Math.round((Date.parse(p.data) - Date.parse(alvo.data)) / (7 * 86400000));
      if (semanas !== 0) extras.push(`${Math.abs(semanas)} semana(s) ${semanas > 0 ? 'depois' : 'antes'} da prova alvo`);
    }
    return `${fmtProva(p)} (${extras.join(', ')})`;
  };
  const semanaAtual = e.semanas.find((s) => s.dataInicio <= e.fim && s.dataFim >= e.fim);
  const linhas = [`# Perfil do atleta (gerado em ${e.geradoEm.slice(0, 10)})`, ''];
  if (alvo) {
    const pace = alvo.metaTempoSegundos && alvo.distanciaKm ? paceTexto(alvo.metaTempoSegundos / alvo.distanciaKm) : null;
    linhas.push(
      `**Prova alvo:** ${alvo.nome}, ${alvo.data}${alvo.distanciaKm ? `, ${alvo.distanciaKm} km` : ''}` +
        `${alvo.metaTempoSegundos ? `, meta ${tempoTexto(alvo.metaTempoSegundos)}` : ''}${pace ? ` (${pace}/km)` : ''}`,
    );
  }
  if (cicloAtivo) {
    linhas.push(
      `**Ciclo atual:** ${cicloAtivo.nome} (${cicloAtivo.dataInicio} a ${cicloAtivo.dataFim})` +
        (semanaAtual ? `, semana ${semanaAtual.numero}${semanaAtual.fase ? `, fase ${semanaAtual.fase}` : ''}` : ''),
    );
    const blocos = (e.blocosCiclo ?? []).filter((b) => b.ciclo === cicloAtivo.nome);
    if (blocos.length) {
      linhas.push(
        `**Blocos do ciclo:** ` +
          blocos
            .map((b) => `${b.nome} (${b.tipo}, ${b.dataInicio} a ${b.dataFim}${b.dataInicio <= e.fim && e.fim <= b.dataFim ? ', ATUAL' : ''})`)
            .join('; '),
      );
      for (const b of blocos.filter((x) => x.objetivo)) linhas.push(`- Objetivo de ${b.nome}: ${b.objetivo}`);
    }
  }
  linhas.push(
    `**Limiar:** ${fcLimiar ? `FC ${fcLimiar} bpm` : 'FC não configurada'} · ${paceLimiarS ? `pace ${paceTexto(paceLimiarS)}/km` : 'pace não configurado'}`,
  );
  if (proximas.length) linhas.push('', '## Próximas provas', ...proximas.map(fmtProxima));
  if (e.recordes.length) {
    linhas.push('', '## Recordes pessoais');
    for (const r of [...e.recordes].sort((a, b) => a.distanciaKm - b.distanciaKm)) {
      linhas.push(
        `- ${r.distanciaKm} km: ${tempoTexto(r.tempoSegundos)} (${paceTexto(r.tempoSegundos / r.distanciaKm)}/km)` +
          `${r.data ? `, ${r.data}` : ''}${r.descricao ? `, ${r.descricao}` : ''}`,
      );
    }
  }
  if (feitas.length) linhas.push('', '## Provas já feitas', ...feitas.map(fmtProva));
  if (e.observacoes?.trim()) linhas.push('', '## Observações do atleta', e.observacoes.trim());
  return linhas.join('\n');
}

export const DICIONARIO = `# Tabelas (pace sempre em segundos por km; datas AAAA-MM-DD)
- atleta(chave, valor): limiares, zonas, período, observações.
- prova / recorde / ciclo / semana: objetivos, histórico e estrutura do plano.
- bloco_ciclo: blocos (mesociclos) de cada ciclo, por data: pre_ciclo, base, desenvolvimento, especifico, polimento, transicao. Não confundir com bloco (trechos dentro de um treino).
- dia: recuperação diária da Garmin (sono, HRV, FC de repouso, stress, body battery, VO2max). O registro do dia é a noite anterior. dz_* = desvio vs os 28 dias anteriores em desvios-padrão (positivo = acima do normal).
- previsto + previsto_bloco: treino proposto pela planilha e seus blocos (aq, continuo, tiro, trote, des) com alvo de pace. Quando a planilha não tem os blocos cadastrados, eles são lidos do texto da descrição.
- treino: cada atividade. Resumo da sessão (TE, carga, dinâmica de corrida), clima, RPE 0-10, sensações e minutos por zona (z1..z5, só trechos planejados, zonas definidas pelo limiar em atleta). divisao = de onde saíram os blocos: laps (voltas do relógio), previsto (texto do proposto, quando o relógio só tinha auto-lap; fronteiras ajustadas à mudança de ritmo) ou nenhuma (um bloco contínuo). carga = carga de treino da Garmin (EPOC); carga_srpe = RPE x minutos (só com RPE registrado).
- bloco: cada trecho do treino (aq, tiro, trote, continuo, des; n = número do tiro). pace_p10/med/p90 e fc_p10/med/p90 são percentis dos trechos planejados, sem paradas e sem o início de FC de cada bloco; pace_p10 = mais rápido. fc_estavel = mediana da FC na 2ª metade. custo_bat_km = FC x pace. gap_s = pace ajustado à inclinação. deriva_pct só em contínuos >= 20 min. queda_fc_60s = FC no fim do tiro menos 60 s depois.
- km: cada km completo dos blocos contínuos (pace, FC mediana, inclinação, cadência). Base da curva pace -> FC.
- extra: trechos não planejados (sprint no fim, voltas depois do desaquecimento). Já estão fora de todas as outras tabelas.
- hist_fc / hist_pace: segundos por bpm e por faixa de 5 s/km, para recalcular zonas com outro limiar.
- Views: v_treino (treino + proposto + contexto do dia), v_km, v_curva_pace_fc (por mês e faixa de 10 s/km), v_tiro (tiros com alvo e % do limiar), v_semana (com o bloco do ciclo), v_bloco_ciclo (volume, RPE, carga e custo por bloco do ciclo).`;

export const CONSULTAS = `# Como começar uma análise
1. Leia a seção perfil desta tabela e a tabela atleta.
2. Consulte só o que a pergunta precisa; nunca faça SELECT * em km, hist_fc ou hist_pace sem filtro.

# Consultas úteis
-- Panorama das últimas 8 semanas
SELECT * FROM v_semana ORDER BY semana DESC LIMIT 8;
-- Comparar blocos do ciclo (volume, carga, custo nos contínuos)
SELECT * FROM v_bloco_ciclo ORDER BY ciclo, ordem;
-- Curva pace -> FC (compare meses; filtre temperatura parecida com v_km se precisar)
SELECT * FROM v_curva_pace_fc WHERE n_km >= 3 ORDER BY mes, faixa_pace_s;
-- Tiros: alvo, execução, FC em % do limiar e fadiga na série
SELECT data, n, km, pace_med_s, alvo_min_s, alvo_max_s, fc_estavel, fc_pct_limiar, queda_fc_60s, cadencia FROM v_tiro ORDER BY data DESC, n;
-- Estímulo real vs proposto
SELECT data, tipo_previsto, te_aerobico, te_anaerobico, z2_fc_min, z3_fc_min, z4_fc_min, rpe FROM v_treino ORDER BY data DESC LIMIT 30;
-- Prontidão x desempenho (custo do bloco principal vs desvios do dia)
SELECT t.data, t.tipo_previsto, t.dz_hrv, t.dz_sono, t.dz_fc_repouso, t.rpe, b.custo_bat_km, b.deriva_pct FROM v_treino t JOIN bloco b ON b.treino_id = t.id AND b.tipo IN ('continuo', 'tiro') ORDER BY t.data DESC;
-- Aderência ao pace alvo nos treinos contínuos
SELECT t.data, t.descricao_prevista, b.pace_med_s, t.pace_alvo_min_s, t.pace_alvo_max_s FROM v_treino t JOIN bloco b ON b.treino_id = t.id AND b.tipo = 'continuo' WHERE t.pace_alvo_min_s IS NOT NULL ORDER BY t.data DESC;

# Regras
- Diga quantos treinos ou minutos sustentam cada conclusão; separe achado de hipótese.
- Compare custo cardíaco só entre dias com temperatura parecida (±4 °C).
- Ignore faixas da curva com poucos km (menos de 3).`;

export function montarLeiaMe(e: EntradaAnalise): Valor[][] {
  return [
    ['perfil', montarPerfil(e)],
    ['tabelas', DICIONARIO],
    ['consultas', CONSULTAS],
  ];
}
