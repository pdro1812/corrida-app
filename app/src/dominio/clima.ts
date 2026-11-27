// v2: clima na hora do treino via Open-Meteo (grátis, sem chave). Lógica
// pura: monta a URL e lê a resposta; o fetch fica em services/sync.ts.
//
// Privacidade: só sai do celular a coordenada arredondada a 2 casas
// (~1 km) e a data.

export interface ClimaTreino {
  temperaturaC: number | null;
  sensacaoTermicaC: number | null;
  umidadePct: number | null;
  pontoOrvalhoC: number | null;
  ventoKmh: number | null;
  precipitacaoMm: number | null;
  codigoTempo: number | null; // WMO weather code
}

const VARIAVEIS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'precipitation',
  'weather_code',
] as const;

// A API de previsão cobre os últimos ~90 dias; antes disso, o arquivo
// histórico (que tem ~5 dias de atraso).
const DIAS_NA_API_DE_PREVISAO = 80;

export const arredondarCoordenada = (grau: number): number => Math.round(grau * 100) / 100;

// Hora UTC cheia mais próxima do meio do treino, no formato da Open-Meteo.
export function horaDeReferencia(horaInicioIso: string, duracaoSegundos: number | null): string {
  const meio = Date.parse(horaInicioIso) + ((duracaoSegundos ?? 0) / 2) * 1000;
  const hora = new Date(Math.round(meio / 3_600_000) * 3_600_000);
  return hora.toISOString().slice(0, 13) + ':00';
}

export function montarUrlClima(latitude: number, longitude: number, horaUtc: string, agora = new Date()): string {
  const dia = horaUtc.slice(0, 10);
  const diasAtras = (agora.getTime() - Date.parse(`${dia}T00:00:00Z`)) / 86_400_000;
  const base =
    diasAtras > DIAS_NA_API_DE_PREVISAO
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
  const parametros = new URLSearchParams({
    latitude: arredondarCoordenada(latitude).toFixed(2),
    longitude: arredondarCoordenada(longitude).toFixed(2),
    hourly: VARIAVEIS.join(','),
    start_date: dia,
    end_date: dia,
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  return `${base}?${parametros.toString()}`;
}

interface RespostaOpenMeteo {
  hourly?: Partial<Record<(typeof VARIAVEIS)[number] | 'time', (number | string | null)[]>>;
}

export function lerClima(resposta: unknown, horaUtc: string): ClimaTreino | null {
  const horario = (resposta as RespostaOpenMeteo | null)?.hourly;
  const indice = horario?.time?.indexOf(horaUtc) ?? -1;
  if (!horario || indice < 0) return null;
  const valor = (variavel: (typeof VARIAVEIS)[number]): number | null => {
    const v = horario[variavel]?.[indice];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const clima: ClimaTreino = {
    temperaturaC: valor('temperature_2m'),
    sensacaoTermicaC: valor('apparent_temperature'),
    umidadePct: valor('relative_humidity_2m'),
    pontoOrvalhoC: valor('dew_point_2m'),
    ventoKmh: valor('wind_speed_10m'),
    precipitacaoMm: valor('precipitation'),
    codigoTempo: valor('weather_code'),
  };
  return clima.temperaturaC === null ? null : clima;
}

// Descrição curta do código WMO, para telas e para o export.
export function descreverTempo(codigo: number | null): string | null {
  if (codigo === null) return null;
  if (codigo === 0) return 'céu limpo';
  if (codigo <= 3) return 'parcialmente nublado';
  if (codigo <= 48) return 'neblina';
  if (codigo <= 57) return 'garoa';
  if (codigo <= 67) return 'chuva';
  if (codigo <= 77) return 'neve';
  if (codigo <= 82) return 'pancadas de chuva';
  return 'tempestade';
}
