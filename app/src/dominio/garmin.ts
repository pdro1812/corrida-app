import { Decoder, LapMesg, Stream } from '@garmin/fitsdk';
import { strFromU8, unzipSync } from 'fflate';
import { formatarPace } from './textoTreino';

// Atividade (parcial) da Garmin Personal API em
// activitylist-service/activities/search/activities — só o que usamos.
export interface AtividadeGarmin {
  activityId: number;
  startTimeLocal: string; // "2026-11-07 07:36:58"
  distance?: number; // metros
  duration?: number; // segundos
  averageSpeed?: number; // m/s
  averageHR?: number;
  maxHR?: number;
  elevationGain?: number;
  lapCount?: number;
  activityType?: { typeKey?: string };
}

// Lap extraído do arquivo FIT — a Personal API não expõe laps em JSON.
export interface LapGarmin {
  distancia?: number; // metros
  duracao?: number; // segundos
  velocidadeMedia?: number; // m/s
  fcMedia?: number;
  intensidade?: string; // enum `intensity` do FIT: active, rest, warmup...
}

export function ehAtividadeDeCorrida(atividade: AtividadeGarmin): boolean {
  return atividade.activityType?.typeKey?.toLowerCase().includes('running') ?? false;
}

export function mapearAtividade(atividade: AtividadeGarmin) {
  return {
    garminActivityId: String(atividade.activityId),
    data: atividade.startTimeLocal.slice(0, 10),
    distanciaKm: atividade.distance ? atividade.distance / 1000 : null,
    duracaoSegundos: atividade.duration ? Math.round(atividade.duration) : null,
    paceMedio: formatarPace(atividade.averageSpeed) ?? null,
    fcMedia: atividade.averageHR ? Math.round(atividade.averageHR) : null,
    fcMax: atividade.maxHR ? Math.round(atividade.maxHR) : null,
    elevacaoM: atividade.elevationGain ?? null,
  };
}

type TipoIntervaloRealizado = 'warmup' | 'run' | 'recovery' | 'cooldown';

// Enum `intensity` do FIT -> tipo de treino_realizado_intervalo. O FIT
// distingue tiro (active) de trote (recovery/rest) em treinos estruturados
// no relógio; `other`/ausente vira 'run'.
const TIPO_POR_INTENSIDADE: Record<string, TipoIntervaloRealizado> = {
  active: 'run',
  interval: 'run',
  rest: 'recovery',
  recovery: 'recovery',
  warmup: 'warmup',
  cooldown: 'cooldown',
};

// repeticaoNumero só incrementa em 'run' e se repete no 'recovery' seguinte
// — assim os tiros ficam 1..N, alinhados com o previsto (RF15/RF22).
export function mapearLapsParaIntervalos(laps: LapGarmin[]) {
  let repeticaoNumero = 0;
  return laps.map((lap, indice) => {
    const tipo = TIPO_POR_INTENSIDADE[lap.intensidade ?? ''] ?? 'run';
    if (tipo === 'run') repeticaoNumero++;
    const contaComoRepeticao = tipo === 'run' || (tipo === 'recovery' && repeticaoNumero > 0);
    return {
      ordem: indice + 1,
      tipo,
      repeticaoNumero: contaComoRepeticao ? repeticaoNumero : null,
      tempoSegundos: lap.duracao ? Math.round(lap.duracao) : null,
      distanciaKm: lap.distancia ? lap.distancia / 1000 : null,
      paceMedio: formatarPace(lap.velocidadeMedia) ?? null,
      fcMedia: lap.fcMedia ? Math.round(lap.fcMedia) : null,
    };
  });
}

// O Hermes (motor JS do app) pode não ter TextDecoder, que o SDK do FIT usa
// para ler strings do arquivo. Polyfill UTF-8 mínimo via fflate.
if (typeof globalThis.TextDecoder === 'undefined') {
  class TextDecoderUtf8 {
    decode(dados?: ArrayBuffer | ArrayBufferView): string {
      if (!dados) return '';
      const bytes =
        dados instanceof Uint8Array
          ? dados
          : ArrayBuffer.isView(dados)
            ? new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
            : new Uint8Array(dados);
      return strFromU8(bytes);
    }
  }
  (globalThis as { TextDecoder?: unknown }).TextDecoder = TextDecoderUtf8;
}

// O download-service entrega um ZIP com um único `<activityId>_ACTIVITY.fit`.
export function extrairLapsDoZip(zip: Uint8Array): LapGarmin[] {
  const arquivos = unzipSync(zip);
  const nomeFit = Object.keys(arquivos).find((nome) => nome.toLowerCase().endsWith('.fit'));
  if (!nomeFit) throw new Error('ZIP da Garmin sem arquivo .fit');
  return extrairLapsDoFit(arquivos[nomeFit]);
}

export function extrairLapsDoFit(fit: Uint8Array): LapGarmin[] {
  const { messages, errors } = new Decoder(Stream.fromBuffer(fit)).read();
  if (errors.length > 0) throw new Error(`Arquivo FIT inválido: ${String(errors[0])}`);
  const laps: LapMesg[] = messages.lapMesgs ?? [];
  return laps.map((lap) => ({
    distancia: lap.totalDistance,
    duracao: lap.totalTimerTime,
    velocidadeMedia: lap.enhancedAvgSpeed ?? lap.avgSpeed,
    fcMedia: lap.avgHeartRate,
    intensidade: typeof lap.intensity === 'string' ? lap.intensity : undefined,
  }));
}
