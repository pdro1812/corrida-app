import { AnaliseTreino, BlocoAnalisado, TrechoExtra } from './blocosFit';
import { ResumoBemEstarDia } from './bemEstar';
import { descreverTempo } from './clima';

// Export para IA em grafo: cada dia liga contexto (sono, HRV, stress...),
// treino proposto e treino executado; os blocos do executado carregam o id
// do bloco proposto. Nada de mínimo/máximo: trios [p10, mediana, p90] dos
// trechos planejados, extras à parte. Os cruzamentos entre dias ficam no
// prompt (PROMPT_ANALISE), não aqui. Lógica pura, sem I/O. Nunca inclui
// coordenadas nem a chave da Garmin.

export const VERSAO_EXPORT = 1;

export interface IntervaloPrevistoEntrada {
  ordem: number;
  tipo: 'aquecimento' | 'tiro' | 'recuperacao' | 'desaquecimento' | string;
  distanciaAlvoKm: number | null;
  duracaoAlvoSegundos: number | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
}

export interface PrevistoEntrada {
  id: string;
  data: string;
  tipo: string | null;
  descricao: string;
  distanciaAlvoKm: number | null;
  duracaoAlvoSegundos: number | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
  status: string;
  motivoNaoRealizado: string | null;
  intervalos: IntervaloPrevistoEntrada[];
  semana: { numero: number; fase: string | null; rotinaExtra: string | null } | null;
}

export interface SessaoEntrada {
  efeitoAerobico: number | null;
  efeitoAnaerobico: number | null;
  carga: number | null;
  cadencia: number | null;
  potencia: number | null;
  contatoMs: number | null;
  oscilacaoMm: number | null;
  passadaM: number | null;
  desacoplamentoPct: number | null;
  temperaturaC: number | null;
  sensacaoTermicaC: number | null;
  umidadePct: number | null;
  ventoKmh: number | null;
  precipitacaoMm: number | null;
  codigoTempo: number | null;
}

export interface RealizadoEntrada {
  id: string;
  previstoId: string | null;
  data: string;
  distanciaKm: number | null;
  duracaoSegundos: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
  elevacaoM: number | null;
  rpe: number | null;
  sensacoes: string[];
  feedbackTexto: string | null;
  sessao: SessaoEntrada | null;
  analise: AnaliseTreino | null;
}

export interface AtletaEntrada {
  fcLimiar: number | null;
  paceLimiarS: number | null; // s/km
  provaAlvo: { nome: string; data: string; distanciaKm: number | null; metaTempoSegundos: number | null } | null;
}

export interface EntradaExport {
  geradoEm: string;
  inicio: string; // YYYY-MM-DD
  fim: string;
  atleta: AtletaEntrada;
  bemEstar: ResumoBemEstarDia[]; // inclui os 28 dias antes de `inicio` (linha de base)
  previstos: PrevistoEntrada[];
  realizados: RealizadoEntrada[];
}

type Json = Record<string, unknown>;

// ---------- formatação ----------

export function paceTexto(segundosPorKm: number | null | undefined): string | null {
  if (segundosPorKm === null || segundosPorKm === undefined || !Number.isFinite(segundosPorKm) || segundosPorKm <= 0) {
    return null;
  }
  const s = Math.round(segundosPorKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function paceSegundos(pace: string | null | undefined): number | null {
  const m = /^(\d+):(\d{2})$/.exec(pace?.trim() ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const arred = (v: number | null | undefined, casas = 0): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** casas) / 10 ** casas;

// Remove campos nulos, vazios e objetos/listas sem conteúdo — o JSON só
// carrega o que existe.
export function compactar(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    const lista = valor.map(compactar).filter((v) => v !== undefined);
    return lista.length ? lista : undefined;
  }
  if (valor && typeof valor === 'object') {
    const saida: Json = {};
    for (const [k, v] of Object.entries(valor)) {
      const c = compactar(v);
      if (c !== undefined) saida[k] = c;
    }
    return Object.keys(saida).length ? saida : undefined;
  }
  if (valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor))) {
    return undefined;
  }
  return valor;
}

// ---------- atleta e zonas ----------

// Zonas como fração do limiar (FC: Friel; pace: tempo por km sobre o pace
// de limiar). Fronteiras inferiores de cada zona, da Z1 à Z5.
const FRACOES_FC = [0, 0.85, 0.9, 0.95, 1.0];
const FRACOES_PACE = [Infinity, 1.29, 1.14, 1.06, 1.0]; // s/km acima de limiar x fração = zona mais lenta

export function zonasFc(fcLimiar: number): number[] {
  return FRACOES_FC.map((f) => Math.round(fcLimiar * f));
}

// Limite lento de cada zona em s/km (Z1 = qualquer coisa mais lenta que Z2).
export function zonasPace(paceLimiarS: number): (number | null)[] {
  return FRACOES_PACE.map((f) => (Number.isFinite(f) ? Math.round(paceLimiarS * f) : null));
}

export function minutosPorZonaFc(hist: Record<string, number>, fcLimiar: number): number[] {
  const limites = zonasFc(fcLimiar);
  const zonas = [0, 0, 0, 0, 0];
  for (const [bpm, segundos] of Object.entries(hist)) {
    const fc = Number(bpm);
    let z = 0;
    for (let i = limites.length - 1; i >= 0; i--) {
      if (fc >= limites[i]) {
        z = i;
        break;
      }
    }
    zonas[z] += segundos;
  }
  return zonas.map((s) => Math.round(s / 60));
}

export function minutosPorZonaPace(hist: Record<string, number>, paceLimiarS: number): number[] {
  const limites = zonasPace(paceLimiarS);
  const zonas = [0, 0, 0, 0, 0];
  for (const [faixa, segundos] of Object.entries(hist)) {
    const pace = Number(faixa);
    let z = 0;
    for (let i = limites.length - 1; i >= 1; i--) {
      if (pace <= (limites[i] as number)) {
        z = i;
        break;
      }
    }
    zonas[z] += segundos;
  }
  return zonas.map((s) => Math.round(s / 60));
}

// ---------- contexto diário ----------

const CAMPOS_DZ: (keyof ResumoBemEstarDia)[] = ['sonoHoras', 'hrvNoite', 'fcRepouso', 'stressMedio', 'bodyBatteryMax'];
const NOME_DZ: Partial<Record<keyof ResumoBemEstarDia, string>> = {
  sonoHoras: 'sono_h',
  hrvNoite: 'hrv',
  fcRepouso: 'fc_rep',
  stressMedio: 'stress',
  bodyBatteryMax: 'bb',
};

// Desvio do dia em relação aos 28 dias anteriores, em desvios-padrão.
// Pede pelo menos 7 dias de base.
export function desviosDoDia(dia: ResumoBemEstarDia, anteriores: ResumoBemEstarDia[]): Json {
  const dz: Json = {};
  for (const campo of CAMPOS_DZ) {
    const atual = dia[campo];
    const base = anteriores.map((d) => d[campo]).filter((v): v is number => typeof v === 'number');
    if (typeof atual !== 'number' || base.length < 7) continue;
    const media = base.reduce((a, b) => a + b, 0) / base.length;
    const dp = Math.sqrt(base.reduce((a, b) => a + (b - media) ** 2, 0) / base.length);
    if (dp > 0) dz[NOME_DZ[campo] as string] = arred((atual - media) / dp, 1);
  }
  return dz;
}

function contextoDoDia(dia: ResumoBemEstarDia | undefined, todos: ResumoBemEstarDia[]): Json | undefined {
  if (!dia) return undefined;
  const anteriores = todos.filter((d) => d.data < dia.data && d.data >= somarDiasIso(dia.data, -28));
  return {
    sono: {
      h: dia.sonoHoras,
      prof_min: dia.sonoProfundoMin,
      rem_min: dia.sonoRemMin,
      despertares: dia.despertares,
      nota: dia.sonoScore,
    },
    hrv: dia.hrvNoite,
    hrv_sem: dia.hrvSemanal,
    hrv_status: dia.hrvStatus,
    fc_rep: dia.fcRepouso,
    stress: dia.stressMedio,
    stress_sono: dia.stressSono,
    resp_sono: dia.respiracaoSono,
    bb: { max: dia.bodyBatteryMax, min: dia.bodyBatteryMin, carga: dia.bodyBatteryCarregado, gasto: dia.bodyBatteryGasto },
    vo2: dia.vo2max,
    dz: desviosDoDia(dia, anteriores),
  };
}

function somarDiasIso(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// ---------- proposto ----------

const faixaPace = (min: string | null, max: string | null) => (min || max ? [min ?? max, max ?? min] : null);

export function blocosPropostos(p: PrevistoEntrada): Json[] {
  const intervalos = [...p.intervalos].sort((a, b) => a.ordem - b.ordem);
  if (intervalos.length === 0) {
    return [{ id: 'c', km: p.distanciaAlvoKm, min: arred(p.duracaoAlvoSegundos ? p.duracaoAlvoSegundos / 60 : null, 1), pace: faixaPace(p.paceAlvoMin, p.paceAlvoMax) }];
  }
  const blocos: Json[] = [];
  const tiros = intervalos.filter((i) => i.tipo === 'tiro');
  const recs = intervalos.filter((i) => i.tipo === 'recuperacao');
  const simples = (i: IntervaloPrevistoEntrada, id: string) => ({
    id,
    km: i.distanciaAlvoKm,
    min: arred(i.duracaoAlvoSegundos ? i.duracaoAlvoSegundos / 60 : null, 1),
    pace: faixaPace(i.paceAlvoMin, i.paceAlvoMax),
  });
  for (const i of intervalos.filter((x) => x.tipo === 'aquecimento')) blocos.push(simples(i, 'aq'));
  if (tiros.length) {
    const t = tiros[0];
    const r = recs[0];
    blocos.push({
      id: 't',
      rep: tiros.length,
      m: t.distanciaAlvoKm ? Math.round(t.distanciaAlvoKm * 1000) : null,
      s: t.duracaoAlvoSegundos,
      pace: faixaPace(t.paceAlvoMin, t.paceAlvoMax),
      rec_m: r?.distanciaAlvoKm ? Math.round(r.distanciaAlvoKm * 1000) : null,
      rec_s: r?.duracaoAlvoSegundos ?? null,
    });
  }
  for (const i of intervalos.filter((x) => x.tipo === 'desaquecimento')) blocos.push(simples(i, 'des'));
  return blocos;
}

function proposto(p: PrevistoEntrada): Json {
  return {
    tipo: p.tipo,
    desc: p.descricao,
    km: p.distanciaAlvoKm,
    min: arred(p.duracaoAlvoSegundos ? p.duracaoAlvoSegundos / 60 : null, 1),
    pace: faixaPace(p.paceAlvoMin, p.paceAlvoMax),
    blocos: blocosPropostos(p),
  };
}

// ---------- executado ----------

// [p10, mediana, p90] de uma lista simples (ex: paces dos tiros).
export function quantis(valores: number[]): [number, number, number] | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const em = (p: number) => o[Math.min(o.length - 1, Math.floor(p * o.length))];
  return [em(0.1), em(0.5), em(0.9)];
}

const trioPace = (t: [number, number, number] | null) => (t ? t.map((v) => paceTexto(v)) : null);

function blocoContinuo(b: BlocoAnalisado, id: string): Json {
  return {
    id,
    km: b.km,
    min: b.min,
    pace: trioPace(b.pace),
    gap: paceTexto(b.gap),
    fc: b.fc,
    fc_ss: b.fcSs,
    custo: b.custo,
    deriva_pct: b.derivaPct,
    cad: b.cad,
    contato_ms: b.contato,
    passada_m: b.passada,
    pot: b.pot,
  };
}

const ID_BLOCO: Record<string, string> = { aq: 'aq', des: 'des', continuo: 'c' };

export function blocosExecutados(analise: AnaliseTreino, alvoTiro: [number, number] | null, fcLimiar: number | null): Json[] {
  const saida: Json[] = [];
  const contagem: Record<string, number> = {};
  const tiros = analise.blocos.filter((b) => b.tipo === 'tiro');
  let tiroIncluido = false;
  for (const b of analise.blocos) {
    if (b.tipo === 'trote') continue;
    if (b.tipo === 'tiro') {
      if (tiroIncluido) continue;
      tiroIncluido = true;
      const paces = tiros.map((t) => t.pace?.[1]).filter((v): v is number => v !== undefined);
      const dentro = alvoTiro ? paces.filter((p) => p >= alvoTiro[0] && p <= alvoTiro[1]).length : null;
      const medFcSs = quantis(tiros.map((t) => t.fcSs).filter((v): v is number => v !== null))?.[1] ?? null;
      const primeiro = tiros[0];
      const ultimo = tiros[tiros.length - 1];
      saida.push({
        id: 't',
        rep: tiros.map((t, i) => [i + 1, paceTexto(t.pace?.[1]), t.km !== null ? Math.round(t.km * 1000) : null, t.fcSs, t.quedaFc60, t.cad, t.contato]),
        resumo: {
          pace: trioPace(quantis(paces)),
          fc_ss_pct_limiar: medFcSs !== null && fcLimiar ? Math.round((medFcSs / fcLimiar) * 100) : null,
          dentro_alvo: dentro !== null ? `${dentro}/${paces.length}` : null,
          // Último tiro menos o primeiro: positivo = mais lento / FC mais alta.
          tend_pace_s: primeiro?.pace && ultimo?.pace && tiros.length > 1 ? Math.round(ultimo.pace[1] - primeiro.pace[1]) : null,
          tend_fc_ss: primeiro?.fcSs != null && ultimo?.fcSs != null && tiros.length > 1 ? ultimo.fcSs - primeiro.fcSs : null,
        },
      });
      continue;
    }
    const base = ID_BLOCO[b.tipo] ?? b.tipo;
    contagem[base] = (contagem[base] ?? 0) + 1;
    saida.push(blocoContinuo(b, contagem[base] > 1 ? `${base}${contagem[base]}` : base));
  }
  return saida;
}

function extrasJson(extras: TrechoExtra[]): Json[] {
  return extras.map((e) => ({ m: e.m, pace: paceTexto(e.paceS), onde: e.onde }));
}

function somarHist(analises: AnaliseTreino[], campo: 'histFc' | 'histPace'): Record<string, number> {
  const total: Record<string, number> = {};
  for (const a of analises) for (const [k, v] of Object.entries(a[campo])) total[k] = (total[k] ?? 0) + v;
  return total;
}

function executado(r: RealizadoEntrada, previsto: PrevistoEntrada | undefined, atleta: AtletaEntrada): Json {
  const s = r.sessao;
  const a = r.analise && r.analise.blocos.length ? r.analise : null;
  const tiro = previsto?.intervalos.find((i) => i.tipo === 'tiro');
  const alvoMin = paceSegundos(tiro?.paceAlvoMin);
  const alvoMax = paceSegundos(tiro?.paceAlvoMax);
  const alvoTiro: [number, number] | null = alvoMin !== null || alvoMax !== null ? [alvoMin ?? (alvoMax as number), alvoMax ?? (alvoMin as number)] : null;
  return {
    km: arred(r.distanciaKm, 2),
    min: arred(r.duracaoSegundos ? r.duracaoSegundos / 60 : null, 1),
    // Sem análise por blocos (manual ou FIT não lido): só o resumo.
    pace_medio: a ? null : r.paceMedio,
    fc_media: a ? null : r.fcMedia,
    subida_m: arred(r.elevacaoM),
    rpe: r.rpe,
    sens: r.sensacoes,
    nota: r.feedbackTexto?.replace(/\s+/g, ' ').trim().slice(0, 280),
    sessao: s
      ? {
          te: s.efeitoAerobico !== null || s.efeitoAnaerobico !== null ? [s.efeitoAerobico, s.efeitoAnaerobico] : null,
          carga: arred(s.carga),
          cad: s.cadencia,
          pot: s.potencia,
          contato_ms: s.contatoMs,
          osc_mm: s.oscilacaoMm,
          passada_m: s.passadaM,
        }
      : null,
    clima: s
      ? {
          temp_c: arred(s.temperaturaC),
          sens_c: arred(s.sensacaoTermicaC),
          umid: arred(s.umidadePct),
          vento_kmh: arred(s.ventoKmh),
          chuva_mm: s.precipitacaoMm ? arred(s.precipitacaoMm, 1) : null,
          cond: descreverTempo(s.codigoTempo),
        }
      : null,
    zonas_fc_min: a && atleta.fcLimiar ? minutosPorZonaFc(a.histFc, atleta.fcLimiar) : null,
    zonas_pace_min: a && atleta.paceLimiarS ? minutosPorZonaPace(a.histPace, atleta.paceLimiarS) : null,
    blocos: a ? blocosExecutados(a, alvoTiro, atleta.fcLimiar) : null,
    seg: a ? a.seg.map(([km, pace, fc, incl, cad]) => [km, paceTexto(pace), fc, incl, cad]) : null,
    extra: a ? extrasJson(a.extras) : null,
  };
}

// ---------- montagem ----------

export const LEGENDA = {
  trio: '[p10, mediana, p90] só dos trechos planejados, sem paradas e sem o início de cada bloco na FC (atraso do coração); pace p10 = mais rápido',
  pace: 'min:ss por km',
  fc_ss: 'FC estável: mediana da FC na 2ª metade do bloco',
  custo: 'batimentos por km = FC mediana x pace em minutos',
  gap: 'pace mediano ajustado à inclinação',
  deriva_pct: 'quanto a FC por velocidade subiu da 1ª para a 2ª metade (blocos contínuos >= 20 min)',
  rep: '[n, pace, metros, fc_ss, queda_fc_60s, cadência, contato_ms] de cada tiro',
  seg: '[km, pace, fc mediana, inclinação %, cadência] de cada km completo dos blocos contínuos',
  extra: 'trechos não planejados (ex: sprint no fim), fora de todas as métricas',
  zonas: 'minutos por zona Z1..Z5, só trechos planejados; fronteiras em atleta',
  dz: 'desvio do dia vs os 28 dias anteriores, em desvios-padrão (positivo = acima do normal)',
  ctx: 'sono, HRV e body battery do registro do dia na Garmin = noite anterior ao treino',
  sessao: 'te = Training Effect [aeróbico, anaeróbico] 0-5; carga = carga de treino Garmin; médias da sessão',
  rpe: 'percepção de esforço 0-10 que eu registrei',
};

export function montarExportGrafo(e: EntradaExport): Json {
  const bemEstarPorDia = new Map(e.bemEstar.map((b) => [b.data, b]));
  const previstoPorId = new Map(e.previstos.map((p) => [p.id, p]));
  const datas = new Set<string>();
  for (const b of e.bemEstar) if (b.data >= e.inicio && b.data <= e.fim) datas.add(b.data);
  for (const p of e.previstos) if (p.data >= e.inicio && p.data <= e.fim) datas.add(p.data);
  for (const r of e.realizados) if (r.data >= e.inicio && r.data <= e.fim) datas.add(r.data);

  const dias = [...datas].sort().map((data) => {
    const previstosDoDia = e.previstos.filter((p) => p.data === data);
    const realizadosDoDia = e.realizados.filter((r) => r.data === data);
    const semana = previstosDoDia.find((p) => p.semana)?.semana ?? null;
    const treinos: Json[] = [];
    // Previsto com os executados vinculados (um previsto pode ter mais de um).
    for (const p of previstosDoDia) {
      const execs = realizadosDoDia.filter((r) => r.previstoId === p.id);
      treinos.push({
        prop: proposto(p),
        status: execs.length ? null : p.status,
        motivo: p.motivoNaoRealizado,
        exec: execs.map((r) => executado(r, p, e.atleta)),
      });
    }
    // Executados vinculados a previsto de outro dia, ou sem previsto.
    for (const r of realizadosDoDia.filter((x) => !previstosDoDia.some((p) => p.id === x.previstoId))) {
      const p = r.previstoId ? previstoPorId.get(r.previstoId) : undefined;
      treinos.push({ prop: p ? { ...proposto(p), data: p.data } : null, exec: [executado(r, p, e.atleta)] });
    }
    return {
      data,
      ctx: contextoDoDia(bemEstarPorDia.get(data), e.bemEstar),
      ciclo: semana
        ? {
            semana: semana.numero,
            fase: semana.fase,
            extra: semana.rotinaExtra,
            dias_prova: e.atleta.provaAlvo ? diasEntre(data, e.atleta.provaAlvo.data) : null,
          }
        : null,
      treinos,
    };
  });

  const { fcLimiar, paceLimiarS, provaAlvo } = e.atleta;
  const realizadosNoPeriodo = e.realizados.filter((r) => r.data >= e.inicio && r.data <= e.fim);
  const analises = realizadosNoPeriodo.map((r) => r.analise).filter((a): a is AnaliseTreino => !!a && a.blocos.length > 0);
  const fcRepBase = e.bemEstar
    .filter((b) => b.data < e.inicio && b.fcRepouso !== null)
    .map((b) => b.fcRepouso as number)
    .sort((a, b) => a - b);

  const saida = {
    v: VERSAO_EXPORT,
    gerado: e.geradoEm.slice(0, 16),
    periodo: [e.inicio, e.fim],
    leg: LEGENDA,
    atleta: {
      fc_limiar: fcLimiar,
      pace_limiar: paceTexto(paceLimiarS),
      fc_rep_base: fcRepBase.length ? fcRepBase[Math.floor(fcRepBase.length / 2)] : null,
      zonas_fc: fcLimiar ? zonasFc(fcLimiar) : null,
      zonas_pace: paceLimiarS ? zonasPace(paceLimiarS).map((v) => (v === null ? 'mais lento' : paceTexto(v))) : null,
      sem_limiar: fcLimiar && paceLimiarS ? null : 'FC ou pace de limiar não configurados: zonas ausentes',
      prova_alvo: provaAlvo
        ? {
            nome: provaAlvo.nome,
            data: provaAlvo.data,
            km: provaAlvo.distanciaKm,
            meta: provaAlvo.metaTempoSegundos ? tempoTexto(provaAlvo.metaTempoSegundos) : null,
          }
        : null,
    },
    periodo_total: {
      treinos: realizadosNoPeriodo.length,
      km: arred(realizadosNoPeriodo.reduce((s, r) => s + (r.distanciaKm ?? 0), 0), 1),
      zonas_fc_min: fcLimiar && analises.length ? minutosPorZonaFc(somarHist(analises, 'histFc'), fcLimiar) : null,
    },
    dias,
  };
  return (compactar(saida) as Json) ?? {};
}

export function tempoTexto(segundos: number): string {
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const resto = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${resto}` : `${m}:${resto}`;
}

// O que a IA deve montar antes de responder. Os cruzamentos ficam aqui de
// propósito: mudar a análise é editar este texto, não o app.
export const PROMPT_ANALISE = `Você é meu treinador de corrida. Analise o JSON abaixo (legenda em "leg").
Cada dia liga contexto (ctx: sono, HRV, stress, body battery), treino proposto (prop) e executado (exec).
Os blocos do executado têm o mesmo id do bloco proposto (aq, t = tiros, c = contínuo, des).

Antes de responder, monte internamente estes cruzamentos:
1. Curva pace -> FC: junte exec.seg e os blocos contínuos, agrupe em faixas de 10 s/km e use a mediana
   de FC por faixa. Compare só dias com clima.temp_c parecido (±4 °C). Ignore faixas com menos de 10 min.
   Diga quanto custa (em bpm) ganhar 5 s/km em cada faixa e onde a curva dobra.
2. Evolução: a mesma curva por blocos de 4 semanas. A mesma FC está dando pace mais rápido?
3. Tiros: fc_ss em % de atleta.fc_limiar por tipo de tiro, tendência dentro da série (tend_pace_s,
   tend_fc_ss), queda da FC em 60 s. Os tiros estão leves demais (dá para acelerar ou alongar) ou pesados?
4. Estímulo real vs proposto: prop.tipo contra sessao.te e zonas. Rodagem que virou moderado? Qualidade
   que ficou aeróbica?
5. Prontidão: ctx.dz (sono, HRV, FC de repouso, stress) contra o custo, a deriva e o RPE do treino do dia.
   Qual sinal prevê melhor um treino ruim?
6. Mecânica: cadência, passada e contato com o solo no início vs fim dos tiros e dos longos.
7. Distribuição: minutos por zona por semana (está polarizado?) e aderência ao pace alvo por bloco.
8. Rumo à prova: com a curva e a fase do ciclo, a meta de atleta.prova_alvo é realista? O que falta?

Regras: nunca use "extra" nas métricas. Para cada conclusão diga quantos treinos ou minutos a sustentam
e separe achado de hipótese. Não repita os dados de volta.
Responda com: os 3 achados mais importantes, o que preocupa, e 1 a 3 ajustes concretos para as próximas semanas.`;

export function textoParaIa(exportJson: Json): string {
  return `${PROMPT_ANALISE}\n\n\`\`\`json\n${JSON.stringify(exportJson)}\n\`\`\`\n`;
}
