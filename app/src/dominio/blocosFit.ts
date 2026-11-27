import { Decoder, LapMesg, RecordMesg, Stream } from '@garmin/fitsdk';
import { dividirPeloPrevisto, parseEstruturaPrevisto, SegmentoPrevisto } from './estruturaPrevisto';

// Export para IA: resume a série segundo a segundo do FIT em blocos
// (aquecimento, tiros, trotes, contínuo, desaquecimento) com métricas
// robustas — percentis em vez de mínimo/máximo, FC sem o atraso do início
// de cada bloco, trechos não planejados (o sprint do fim) separados como
// "extra". Guarda também a distribuição de FC e de pace (histogramas), para
// as zonas serem calculadas no export com o limiar atual. Lógica pura.

// 2: divisão pelo previsto quando o relógio só tem auto-lap.
export const VERSAO_ANALISE = 2;

export interface AmostraCompleta {
  t: number; // segundos desde o início da atividade
  fc?: number;
  vel?: number; // m/s
  dist?: number; // m acumulados
  alt?: number; // m
  cad?: number; // passos/min
  contato?: number; // ms
  passada?: number; // m
  pot?: number; // W
}

export type TipoLap = 'warmup' | 'run' | 'recovery' | 'cooldown';

export interface LapTempo {
  inicio: number; // segundos desde o início da atividade
  fim: number;
  tipo: TipoLap;
}

export type TipoBloco = 'aq' | 'tiro' | 'trote' | 'continuo' | 'des';

export interface BlocoAnalisado {
  tipo: TipoBloco;
  inicio: number;
  fim: number;
  km: number | null;
  min: number;
  pace: [number, number, number] | null; // s/km [p10, mediana, p90]; p10 = mais rápido
  fc: [number, number, number] | null; // bpm [p10, mediana, p90]
  fcSs: number | null; // mediana da FC na 2ª metade do bloco
  custo: number | null; // batimentos por km
  gap: number | null; // s/km, pace mediano ajustado à inclinação
  derivaPct: number | null; // só blocos contínuos de 20 min ou mais
  cad: number | null; // medianas
  contato: number | null;
  passada: number | null;
  pot: number | null;
  quedaFc60: number | null; // tiros: FC no fim do tiro menos FC 60 s depois
}

export type Segmento = [km: number, paceS: number, fc: number | null, inclinacaoPct: number | null, cad: number | null];

export interface TrechoExtra {
  m: number;
  paceS: number | null;
  onde: string;
}

// De onde saíram os blocos: voltas do relógio (treino estruturado ou botão
// de volta), texto do previsto, ou nenhuma divisão (um bloco contínuo).
export type DivisaoBlocos = 'laps' | 'previsto' | 'nenhuma';

export interface AnaliseTreino {
  versao: number;
  divisao?: DivisaoBlocos;
  previstoId?: string | null; // previsto usado na divisão (reprocessa se o vínculo mudar)
  blocos: BlocoAnalisado[];
  seg: Segmento[];
  extras: TrechoExtra[];
  histFc: Record<string, number>; // bpm -> segundos (só trechos planejados)
  histPace: Record<string, number>; // s/km em degraus de 5 -> segundos
}

export const analiseVazia = (): AnaliseTreino => ({
  versao: VERSAO_ANALISE,
  divisao: 'nenhuma',
  blocos: [],
  seg: [],
  extras: [],
  histFc: {},
  histPace: {},
});

const VEL_MIN_MOVIMENTO = 1.5; // m/s (pace acima de ~11:00 = parado/andando)
const SALTO_FC_SENSOR = 20; // bpm em até 2 s = falha do sensor
const DT_MAX = 10; // s; buracos maiores (pausa) não pesam
const ATRASO_FC_LONGO = 60; // s ignorados de FC no início de bloco >= 5 min
const ATRASO_FC_CURTO = 20; // s ignorados de FC no início de tiros curtos
const FATOR_SPRINT = 1.15;
const DURACAO_DERIVA_MIN = 20 * 60;

const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const arred = (v: number | null, casas = 0): number | null =>
  v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** casas) / 10 ** casas;

interface Ponderado {
  v: number;
  w: number;
}

// Percentil ponderado pelo tempo de cada amostra (gravação "inteligente"
// do relógio não é a cada 1 s).
export function percentilPonderado(valores: Ponderado[], p: number): number | null {
  const validos = valores.filter((x) => x.w > 0 && Number.isFinite(x.v)).sort((a, b) => a.v - b.v);
  const total = validos.reduce((s, x) => s + x.w, 0);
  if (total === 0) return null;
  const alvo = total * p;
  let acumulado = 0;
  for (const x of validos) {
    acumulado += x.w;
    if (acumulado >= alvo) return x.v;
  }
  return validos[validos.length - 1].v;
}

const trio = (valores: Ponderado[], casas = 0): [number, number, number] | null => {
  const p10 = percentilPonderado(valores, 0.1);
  const p50 = percentilPonderado(valores, 0.5);
  const p90 = percentilPonderado(valores, 0.9);
  return p10 === null || p50 === null || p90 === null
    ? null
    : [arred(p10, casas) as number, arred(p50, casas) as number, arred(p90, casas) as number];
};

// Peso de cada amostra = tempo até a próxima (limitado, para pausas).
function comPeso(amostras: AmostraCompleta[]): (AmostraCompleta & { dt: number })[] {
  return amostras.map((a, i) => ({ ...a, dt: Math.min(DT_MAX, Math.max(0, (amostras[i + 1]?.t ?? a.t + 1) - a.t)) }));
}

// Remove leituras de FC que saltam mais de 20 bpm em até 2 s.
export function limparFc(amostras: AmostraCompleta[]): AmostraCompleta[] {
  let anterior: { t: number; fc: number } | null = null;
  return amostras.map((a) => {
    if (a.fc === undefined || a.fc <= 30) return { ...a, fc: undefined };
    if (anterior && a.t - anterior.t <= 2 && Math.abs(a.fc - anterior.fc) > SALTO_FC_SENSOR) {
      return { ...a, fc: undefined };
    }
    anterior = { t: a.t, fc: a.fc };
    return a;
  });
}

// Custo de energia da inclinação (aproximação linear de Minetti): subida
// custa ~3,5% por ponto percentual, descida devolve ~1,8%.
export function fatorInclinacao(inclinacaoPct: number): number {
  const g = Math.max(-10, Math.min(10, inclinacaoPct));
  return g >= 0 ? 1 + 0.035 * g : 1 + 0.018 * g;
}

// Inclinação de cada amostra numa janela de ±15 s (exige 20 m andados).
function inclinacoes(amostras: AmostraCompleta[]): (number | null)[] {
  return amostras.map((a, i) => {
    let ini = i;
    let fim = i;
    while (ini > 0 && a.t - amostras[ini - 1].t <= 15) ini--;
    while (fim < amostras.length - 1 && amostras[fim + 1].t - a.t <= 15) fim++;
    const d0 = amostras[ini].dist;
    const d1 = amostras[fim].dist;
    const h0 = amostras[ini].alt;
    const h1 = amostras[fim].alt;
    if (d0 === undefined || d1 === undefined || h0 === undefined || h1 === undefined || d1 - d0 < 20) return null;
    return ((h1 - h0) / (d1 - d0)) * 100;
  });
}

const paceDe = (vel: number) => 1000 / vel;

function mediana(valores: Ponderado[]): number | null {
  return percentilPonderado(valores, 0.5);
}

interface Janela {
  tipo: TipoBloco;
  inicio: number;
  fim: number;
}

// Laps -> janelas de bloco. Auto-laps (todos "run", sem trote) viram um
// bloco contínuo só; em treino com trote, cada "run" é um tiro.
export function montarJanelas(laps: LapTempo[], inicio: number, fim: number): Janela[] {
  if (laps.length === 0) return [{ tipo: 'continuo', inicio, fim }];
  const temTrote = laps.some((l) => l.tipo === 'recovery');
  const tipoDe = (l: LapTempo): TipoBloco =>
    l.tipo === 'warmup' ? 'aq' : l.tipo === 'cooldown' ? 'des' : l.tipo === 'recovery' ? 'trote' : temTrote ? 'tiro' : 'continuo';
  const janelas: Janela[] = [];
  for (const lap of laps) {
    const tipo = tipoDe(lap);
    const ultima = janelas[janelas.length - 1];
    // Laps seguidos do mesmo tipo contínuo (auto-lap por km) se juntam.
    if (ultima && ultima.tipo === tipo && tipo !== 'tiro' && tipo !== 'trote') ultima.fim = lap.fim;
    else janelas.push({ tipo, inicio: lap.inicio, fim: lap.fim });
  }
  return janelas;
}

// Sprint final não planejado: a cauda do último bloco contínuo em que a
// velocidade (média de 15 s) passa 15% da mediana do bloco. Só conta se
// durar entre 8 s e 3 min.
export function detectarSprintFinal(amostras: AmostraCompleta[], janela: Janela): number | null {
  const doBloco = amostras.filter((a) => a.t >= janela.inicio && a.t < janela.fim && (a.vel ?? 0) >= VEL_MIN_MOVIMENTO);
  if (doBloco.length < 30) return null;
  const pesos = comPeso(doBloco);
  const referencia = mediana(pesos.map((a) => ({ v: a.vel as number, w: a.dt })));
  if (referencia === null) return null;
  const media15 = (i: number) => {
    const fimT = doBloco[i].t;
    const janela15 = doBloco.filter((a) => a.t > fimT - 15 && a.t <= fimT);
    return janela15.reduce((s, a) => s + (a.vel as number), 0) / janela15.length;
  };
  let i = doBloco.length - 1;
  while (i > 0 && media15(i) > referencia * FATOR_SPRINT) i--;
  if (i === doBloco.length - 1) return null;
  // A média de 15 s atrasa: o sprint começa ~15 s depois do ponto achado
  // ou onde a velocidade instantânea passa do limite.
  let corte = i + 1;
  while (corte > 0 && (doBloco[corte - 1].vel as number) > referencia * FATOR_SPRINT) corte--;
  const duracao = janela.fim - doBloco[corte].t;
  return duracao >= 8 && duracao <= 180 ? doBloco[corte].t : null;
}

function analisarBloco(
  amostras: (AmostraCompleta & { dt: number; incl: number | null })[],
  janela: Janela,
  proxima: Janela | undefined,
): BlocoAnalisado {
  const doBloco = amostras.filter((a) => a.t >= janela.inicio && a.t < janela.fim);
  const movendo = doBloco.filter((a) => (a.vel ?? 0) >= VEL_MIN_MOVIMENTO);
  const duracao = janela.fim - janela.inicio;
  const atraso = duracao >= 300 ? ATRASO_FC_LONGO : janela.tipo === 'trote' ? 0 : ATRASO_FC_CURTO;
  const comFc = movendo.filter((a) => a.fc !== undefined && a.t >= janela.inicio + atraso);
  const fcs = comFc.map((a) => ({ v: a.fc as number, w: a.dt }));

  const paces = movendo.map((a) => ({ v: paceDe(a.vel as number), w: a.dt }));
  const pace = trio(paces);
  const fc = trio(fcs);
  const metade = janela.inicio + duracao / 2;
  const fcSs = arred(mediana(comFc.filter((a) => a.t >= metade).map((a) => ({ v: a.fc as number, w: a.dt }))));
  const custo = pace && fc ? Math.round((fc[1] * pace[1]) / 60) : null;
  const gap = arred(
    mediana(
      movendo
        .filter((a) => a.incl !== null)
        .map((a) => ({ v: paceDe((a.vel as number) * fatorInclinacao(a.incl as number)), w: a.dt })),
    ),
  );

  let derivaPct: number | null = null;
  if ((janela.tipo === 'continuo' || janela.tipo === 'aq' || janela.tipo === 'des') && duracao >= DURACAO_DERIVA_MIN) {
    const eficiencia = (parte: typeof comFc) => {
      const peso = parte.reduce((s, a) => s + a.dt, 0);
      if (peso === 0) return null;
      const vel = parte.reduce((s, a) => s + (a.vel as number) * a.dt, 0) / peso;
      const f = parte.reduce((s, a) => s + (a.fc as number) * a.dt, 0) / peso;
      return vel / f;
    };
    const meioFc = comFc.length ? comFc[0].t + (janela.fim - comFc[0].t) / 2 : metade;
    const e1 = eficiencia(comFc.filter((a) => a.t < meioFc));
    const e2 = eficiencia(comFc.filter((a) => a.t >= meioFc));
    if (e1 && e2) derivaPct = arred((e1 / e2 - 1) * 100, 1);
  }

  let quedaFc60: number | null = null;
  if (janela.tipo === 'tiro' && proxima?.tipo === 'trote') {
    const fimTiro = doBloco.filter((a) => a.fc !== undefined && a.t >= janela.fim - 5);
    const depois = amostras.filter((a) => a.fc !== undefined && a.t >= janela.fim + 55 && a.t <= janela.fim + 65 && a.t < proxima.fim + 5);
    const m1 = mediana(fimTiro.map((a) => ({ v: a.fc as number, w: 1 })));
    const m2 = mediana(depois.map((a) => ({ v: a.fc as number, w: 1 })));
    if (m1 !== null && m2 !== null) quedaFc60 = Math.round(m1 - m2);
  }

  const med = (campo: 'cad' | 'contato' | 'passada' | 'pot', casas = 0) =>
    arred(mediana(movendo.filter((a) => a[campo] !== undefined).map((a) => ({ v: a[campo] as number, w: a.dt }))), casas);

  const d0 = doBloco.find((a) => a.dist !== undefined)?.dist;
  const d1 = [...doBloco].reverse().find((a) => a.dist !== undefined)?.dist;
  return {
    tipo: janela.tipo,
    inicio: janela.inicio,
    fim: janela.fim,
    km: d0 !== undefined && d1 !== undefined ? arred((d1 - d0) / 1000, 2) : null,
    min: arred(duracao / 60, 1) as number,
    pace,
    fc,
    fcSs,
    custo,
    gap,
    derivaPct,
    cad: med('cad'),
    contato: med('contato'),
    passada: med('passada', 2),
    pot: med('pot'),
    quedaFc60,
  };
}

// Uma linha por km completo dos blocos contínuos (planejados).
function segmentosPorKm(amostras: (AmostraCompleta & { dt: number })[], janelas: Janela[]): Segmento[] {
  const seg: Segmento[] = [];
  let kmGlobal = 0;
  for (const janela of janelas) {
    if (janela.tipo === 'tiro' || janela.tipo === 'trote') continue;
    const doBloco = amostras.filter((a) => a.t >= janela.inicio && a.t < janela.fim && a.dist !== undefined);
    if (doBloco.length < 2) continue;
    const base = doBloco[0].dist as number;
    let marco = 1000;
    let inicioKm = 0;
    for (let i = 1; i < doBloco.length; i++) {
      if ((doBloco[i].dist as number) - base < marco) continue;
      // Amostras do início do km até a anterior ao marco: o dt de cada uma
      // cobre o trecho até a seguinte, então tempo e distância batem.
      const trecho = doBloco.slice(inicioKm, i);
      const movendo = trecho.filter((a) => (a.vel ?? 0) >= VEL_MIN_MOVIMENTO);
      const tempo = movendo.reduce((s, a) => s + a.dt, 0);
      const distancia = (doBloco[i].dist as number) - (doBloco[inicioKm].dist as number);
      const h0 = doBloco[inicioKm].alt;
      const h1 = doBloco[i].alt;
      kmGlobal++;
      if (tempo > 0 && distancia > 0) {
        seg.push([
          kmGlobal,
          Math.round((tempo / distancia) * 1000),
          arred(mediana(movendo.filter((a) => a.fc !== undefined).map((a) => ({ v: a.fc as number, w: a.dt })))),
          h0 !== undefined && h1 !== undefined ? arred(((h1 - h0) / distancia) * 100, 1) : null,
          arred(mediana(movendo.filter((a) => a.cad !== undefined).map((a) => ({ v: a.cad as number, w: a.dt })))),
        ]);
      }
      inicioKm = i;
      marco += 1000;
    }
  }
  return seg;
}

export function analisarAtividade(
  amostrasBrutas: AmostraCompleta[],
  laps: LapTempo[],
  estrutura?: SegmentoPrevisto[] | null,
): AnaliseTreino | null {
  const ordenadas = [...amostrasBrutas].sort((a, b) => a.t - b.t);
  if (ordenadas.length < 30) return null;
  const limpas = limparFc(ordenadas);
  const incl = inclinacoes(limpas);
  const amostras = comPeso(limpas).map((a, i) => ({ ...a, incl: incl[i] }));
  const inicio = amostras[0].t;
  const fim = amostras[amostras.length - 1].t + 1;

  let janelas = montarJanelas(laps, inicio, fim);
  let divisao: DivisaoBlocos = janelas.length > 1 ? 'laps' : 'nenhuma';
  // Relógio sem voltas de estrutura (auto-lap por km): divide pelo previsto.
  if (divisao === 'nenhuma' && estrutura) {
    const pelaEstrutura = dividirPeloPrevisto(amostras, estrutura);
    if (pelaEstrutura) {
      janelas = pelaEstrutura;
      divisao = 'previsto';
    }
  }
  const extras: TrechoExtra[] = [];
  const extraDe = (j: Janela, onde: string) => {
    const doTrecho = amostras.filter((a) => a.t >= j.inicio && a.t < j.fim);
    const d0 = doTrecho.find((a) => a.dist !== undefined)?.dist;
    const d1 = [...doTrecho].reverse().find((a) => a.dist !== undefined)?.dist;
    const metros = d0 !== undefined && d1 !== undefined ? Math.round(d1 - d0) : 0;
    const tempo = doTrecho.filter((a) => (a.vel ?? 0) >= VEL_MIN_MOVIMENTO).reduce((s, a) => s + a.dt, 0);
    extras.push({ m: metros, paceS: metros > 0 && tempo > 0 ? Math.round((tempo / metros) * 1000) : null, onde });
  };

  // Tudo depois do desaquecimento é extra.
  const ultimoDes = janelas.map((j) => j.tipo).lastIndexOf('des');
  if (ultimoDes >= 0 && ultimoDes < janelas.length - 1) {
    for (const j of janelas.slice(ultimoDes + 1)) extraDe(j, 'após o desaquecimento');
    janelas = janelas.slice(0, ultimoDes + 1);
  }
  // Sprint na cauda do último bloco contínuo ou desaquecimento.
  const ultima = janelas[janelas.length - 1];
  if (ultima && ultima.tipo !== 'tiro' && ultima.tipo !== 'trote') {
    const corte = detectarSprintFinal(amostras, ultima);
    if (corte !== null) {
      extraDe({ tipo: ultima.tipo, inicio: corte, fim: ultima.fim }, 'no fim do treino');
      ultima.fim = corte;
    }
  }

  const blocos = janelas.map((j, i) => analisarBloco(amostras, j, janelas[i + 1]));

  const histFc: Record<string, number> = {};
  const histPace: Record<string, number> = {};
  for (const j of janelas) {
    const duracao = j.fim - j.inicio;
    const atraso = duracao >= 300 ? ATRASO_FC_LONGO : j.tipo === 'trote' ? 0 : ATRASO_FC_CURTO;
    for (const a of amostras) {
      if (a.t < j.inicio || a.t >= j.fim || (a.vel ?? 0) < VEL_MIN_MOVIMENTO) continue;
      const faixaPace = String(Math.round(paceDe(a.vel as number) / 5) * 5);
      histPace[faixaPace] = (histPace[faixaPace] ?? 0) + a.dt;
      if (a.fc !== undefined && a.t >= j.inicio + atraso) {
        const bpm = String(Math.round(a.fc));
        histFc[bpm] = (histFc[bpm] ?? 0) + a.dt;
      }
    }
  }
  const arredondarHist = (h: Record<string, number>) =>
    Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => (v as number) > 0));

  return {
    versao: VERSAO_ANALISE,
    divisao,
    blocos,
    seg: segmentosPorKm(amostras, janelas),
    extras,
    histFc: arredondarHist(histFc),
    histPace: arredondarHist(histPace),
  };
}

const TIPO_LAP: Record<string, TipoLap> = {
  active: 'run',
  interval: 'run',
  rest: 'recovery',
  recovery: 'recovery',
  warmup: 'warmup',
  cooldown: 'cooldown',
};

// Cadência de corrida no FIT vem em passadas/min (um pé): x2 = passos/min.
export function amostrasCompletasDosRecords(records: RecordMesg[]): { amostras: AmostraCompleta[]; zero: number | null } {
  const comHora = records.filter((r) => r.timestamp instanceof Date);
  if (comHora.length === 0) return { amostras: [], zero: null };
  const zero = (comHora[0].timestamp as Date).getTime();
  const amostras = comHora.map((r) => {
    const cadencia = numero(r.cadence);
    const passadaMm = numero(r.stepLength);
    return {
      t: ((r.timestamp as Date).getTime() - zero) / 1000,
      fc: numero(r.heartRate),
      vel: numero(r.enhancedSpeed ?? r.speed),
      dist: numero(r.distance),
      alt: numero(r.enhancedAltitude ?? r.altitude),
      cad: cadencia === undefined ? undefined : Math.round((cadencia + (numero(r.fractionalCadence) ?? 0)) * 2),
      contato: numero(r.stanceTime),
      passada: passadaMm === undefined ? undefined : passadaMm / 1000,
      pot: numero(r.power),
    };
  });
  return { amostras, zero };
}

export function lapsComTempo(laps: LapMesg[], zero: number): LapTempo[] {
  return laps
    .filter((l) => l.startTime instanceof Date)
    .map((l) => {
      const inicio = ((l.startTime as Date).getTime() - zero) / 1000;
      const fim =
        l.timestamp instanceof Date
          ? (l.timestamp.getTime() - zero) / 1000
          : inicio + (numero(l.totalElapsedTime) ?? 0);
      const intensidade = typeof l.intensity === 'string' ? l.intensity : '';
      return { inicio, fim, tipo: TIPO_LAP[intensidade] ?? 'run' };
    })
    .filter((l) => l.fim > l.inicio);
}

export function extrairAnaliseDoFit(fit: Uint8Array, descricaoPrevista?: string | null): AnaliseTreino | null {
  const { messages, errors } = new Decoder(Stream.fromBuffer(fit)).read();
  if (errors.length > 0) throw new Error(`Arquivo FIT inválido: ${String(errors[0])}`);
  const { amostras, zero } = amostrasCompletasDosRecords(messages.recordMesgs ?? []);
  if (zero === null) return null;
  const laps = lapsComTempo(messages.lapMesgs ?? [], zero);
  // Uma volta só = sem estrutura: trata como contínuo.
  return analisarAtividade(amostras, laps.length > 1 ? laps : [], parseEstruturaPrevisto(descricaoPrevista));
}
