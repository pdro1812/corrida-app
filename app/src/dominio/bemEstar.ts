// v2: dados diários de recuperação da Garmin Personal API (sono, HRV,
// stress, Body Battery, resumo diário, VO2max). Caminhos do client oficial
// github.com/garmin/connect-personal-api-python. Lógica pura, sem I/O.
//
// O formato exato das respostas não é documentado fora do Swagger da
// Garmin; por isso o JSON é guardado (podado) por dia e a leitura procura
// os campos por uma lista de nomes candidatos. A tela de diagnóstico mostra
// a estrutura (só nomes de campos) para confirmar.

export type FonteBemEstar = 'sono' | 'hrv' | 'stress' | 'body_battery' | 'resumo' | 'vo2max';

// Endpoints por intervalo (um pedido cobre vários dias). Datas YYYY-MM-DD.
export const FONTES_BEM_ESTAR: Record<FonteBemEstar, (inicio: string, fim: string) => string> = {
  sono: (i, f) => `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${i}&endDate=${f}`,
  hrv: (i, f) => `/hrv-service/hrv/daily/${i}/${f}`,
  stress: (i, f) => `/usersummary-service/stats/stress/daily/${i}/${f}`,
  body_battery: (i, f) => `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${i}&endDate=${f}`,
  resumo: (i, f) => `/usersummary-service/v2/dailysummaries?startDate=${i}&endDate=${f}`,
  vo2max: (i, f) => `/metrics-service/metrics/maxmet/daily/${i}/${f}`,
};

const CHAVES_DE_DATA = ['calendarDate', 'calendardate', 'date', 'summaryDate', 'startDate', 'day'];
const RE_DATA = /^\d{4}-\d{2}-\d{2}/;

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);

function dataDoRegistro(registro: Objeto): string | null {
  for (const chave of CHAVES_DE_DATA) {
    const v = registro[chave];
    if (typeof v === 'string' && RE_DATA.test(v)) return v.slice(0, 10);
  }
  return null;
}

// Séries temporais (ex: Body Battery a cada 3 min, épocas de sono) não
// servem para o export e incham o banco: corta arrays longos de números ou
// pares e limita a profundidade.
export function podarJson(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4) return undefined;
  if (Array.isArray(valor)) {
    if (valor.length > 24) return undefined;
    return valor.map((v) => podarJson(v, profundidade + 1));
  }
  if (ehObjeto(valor)) {
    const saida: Objeto = {};
    for (const [k, v] of Object.entries(valor)) {
      const podado = podarJson(v, profundidade + 1);
      if (podado !== undefined) saida[k] = podado;
    }
    return saida;
  }
  return valor;
}

// Separa a resposta de um endpoint de intervalo em um registro por dia.
export function separarPorDia(resposta: unknown): Map<string, Objeto> {
  const dias = new Map<string, Objeto>();
  const visitar = (valor: unknown, profundidade: number) => {
    if (profundidade > 3) return;
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item, profundidade + 1);
      return;
    }
    if (!ehObjeto(valor)) return;
    const data = dataDoRegistro(valor);
    if (data) {
      dias.set(data, { ...(dias.get(data) ?? {}), ...valor });
      return;
    }
    for (const filho of Object.values(valor)) visitar(filho, profundidade + 1);
  };
  visitar(resposta, 0);
  return dias;
}

// Primeiro valor encontrado para um dos nomes candidatos (sem diferenciar
// maiúsculas), procurando até 3 níveis. Objeto com `value` vira o valor.
function procurar(registro: unknown, candidatos: string[], profundidade = 0): unknown {
  if (!ehObjeto(registro) || profundidade > 3) return undefined;
  const nomes = candidatos.map((c) => c.toLowerCase());
  for (const [k, v] of Object.entries(registro)) {
    if (nomes.includes(k.toLowerCase())) return ehObjeto(v) && 'value' in v ? v.value : v;
  }
  for (const v of Object.values(registro)) {
    const achado = procurar(v, candidatos, profundidade + 1);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.length < 40 ? v : null);

export interface ResumoBemEstarDia {
  data: string;
  sonoHoras: number | null;
  sonoScore: number | null;
  hrvNoite: number | null; // ms, média da noite
  hrvStatus: string | null;
  stressMedio: number | null;
  bodyBatteryMax: number | null;
  bodyBatteryMin: number | null;
  fcRepouso: number | null;
  vo2max: number | null;
}

export function resumirDia(data: string, porFonte: Partial<Record<FonteBemEstar, unknown>>): ResumoBemEstarDia {
  const { sono, hrv, stress, body_battery: bb, resumo, vo2max } = porFonte;
  const segundosSono = numero(
    procurar(sono, ['sleepTimeSeconds', 'durationInSeconds', 'totalSleepSeconds', 'sleepDurationInSeconds']),
  );
  const arred = (v: number | null, casas = 0) => (v === null ? null : Number(v.toFixed(casas)));
  return {
    data,
    sonoHoras: segundosSono === null ? null : arred(segundosSono / 3600, 1),
    sonoScore: arred(numero(procurar(sono, ['overallSleepScore', 'sleepScore', 'overall', 'sleepScoreValue']))),
    hrvNoite: arred(numero(procurar(hrv, ['lastNightAvg', 'lastNightAverage', 'avgOvernightHrv', 'hrvValue']))),
    hrvStatus: texto(procurar(hrv, ['status', 'hrvStatus'])),
    stressMedio: arred(
      numero(procurar(stress, ['averageStressLevel', 'avgStressLevel', 'overallStressLevel'])) ??
        numero(procurar(resumo, ['averageStressLevel'])),
    ),
    bodyBatteryMax: arred(
      numero(procurar(bb, ['bodyBatteryHighestValue', 'highestValue', 'maxBodyBattery', 'bodyBatteryHighValue'])) ??
        numero(procurar(resumo, ['bodyBatteryHighestValue'])),
    ),
    bodyBatteryMin: arred(
      numero(procurar(bb, ['bodyBatteryLowestValue', 'lowestValue', 'minBodyBattery', 'bodyBatteryLowValue'])) ??
        numero(procurar(resumo, ['bodyBatteryLowestValue'])),
    ),
    fcRepouso: arred(
      numero(procurar(resumo, ['restingHeartRate', 'restingHeartRateInBeatsPerMinute', 'restingHr'])) ??
        numero(procurar(hrv, ['restingHeartRate'])),
    ),
    vo2max: arred(numero(procurar(vo2max, ['vo2MaxPreciseValue', 'vo2MaxValue', 'vo2Max'])), 1),
  };
}

// Diagnóstico: só a estrutura (nomes de campos e tipos), nunca os valores
// — pode ser compartilhada sem expor dados de saúde.
export function descreverEstrutura(valor: unknown, profundidade = 0): string {
  if (profundidade > 3) return '…';
  if (Array.isArray(valor)) {
    return valor.length === 0 ? '[]' : `[${valor.length}× ${descreverEstrutura(valor[0], profundidade + 1)}]`;
  }
  if (ehObjeto(valor)) {
    const campos = Object.entries(valor)
      .slice(0, 40)
      .map(([k, v]) => `${k}: ${descreverEstrutura(v, profundidade + 1)}`);
    return `{ ${campos.join(', ')} }`;
  }
  return valor === null ? 'null' : typeof valor;
}
