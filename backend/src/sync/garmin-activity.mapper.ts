import { IActivity } from 'garmin-connect/dist/garmin/types/activity';
import { GarminLapDTO } from '../garmin/garmin.types';

export function ehAtividadeDeCorrida(atividade: IActivity): boolean {
  return (
    atividade.activityType?.typeKey?.toLowerCase().includes('running') ?? false
  );
}

// Converte velocidade (m/s) para pace no formato "M:SS" (min/km).
export function formatarPace(
  velocidadeMetrosPorSegundo: number | undefined,
): string | undefined {
  if (!velocidadeMetrosPorSegundo || velocidadeMetrosPorSegundo <= 0) {
    return undefined;
  }
  // Arredonda para segundos inteiros ANTES de separar min/seg — fazer o
  // round() depois do módulo pode estourar pra "60" por imprecisão de
  // ponto flutuante (ex: 239.99999999999997 % 60 arredondaria pra 60).
  const segundosPorKm = Math.round(1000 / velocidadeMetrosPorSegundo);
  const minutos = Math.floor(segundosPorKm / 60);
  const segundos = segundosPorKm % 60;
  return `${minutos}:${segundos.toString().padStart(2, '0')}`;
}

export interface TreinoRealizadoImportado {
  garminActivityId: string;
  fonte: 'garmin';
  data: Date;
  distanciaKm?: number;
  duracaoSegundos?: number;
  paceMedio?: string;
  fcMedia?: number;
  fcMax?: number;
  elevacaoM?: number;
}

export function mapearAtividadeParaTreinoRealizado(
  atividade: IActivity,
): TreinoRealizadoImportado {
  return {
    garminActivityId: String(atividade.activityId),
    fonte: 'garmin',
    data: new Date(atividade.startTimeLocal.slice(0, 10)),
    distanciaKm: atividade.distance ? atividade.distance / 1000 : undefined,
    duracaoSegundos: atividade.duration
      ? Math.round(atividade.duration)
      : undefined,
    paceMedio: formatarPace(atividade.averageSpeed),
    fcMedia: atividade.averageHR ? Math.round(atividade.averageHR) : undefined,
    fcMax: atividade.maxHR ? Math.round(atividade.maxHR) : undefined,
    elevacaoM: atividade.elevationGain,
  };
}

// Nomenclatura do Garmin (ver docs/DATA_MODEL.md, comentário de
// treino_realizado_intervalo.tipo): WARMUP/ACTIVE/REST/COOLDOWN.
const MAPA_INTENSITY_TYPE: Record<
  string,
  'warmup' | 'run' | 'recovery' | 'cooldown'
> = {
  WARMUP: 'warmup',
  ACTIVE: 'run',
  REST: 'recovery',
  COOLDOWN: 'cooldown',
};

export interface TreinoRealizadoIntervaloImportado {
  ordem: number;
  tipo: 'warmup' | 'run' | 'recovery' | 'cooldown';
  repeticaoNumero: number | null;
  tempoSegundos?: number;
  distanciaKm?: number;
  paceMedio?: string;
  fcMedia?: number;
}

// repeticaoNumero é um número sequencial por par run/recovery — casa com
// TreinoPrevistoIntervalo.repeticaoNumero apenas quando o matching (RF15)
// for implementado; aqui só numeramos de forma consistente.
export function mapearSplitsParaIntervalos(
  laps: GarminLapDTO[],
): TreinoRealizadoIntervaloImportado[] {
  let repeticaoNumero = 0;

  return laps.map((lap, indice) => {
    const tipo = MAPA_INTENSITY_TYPE[lap.intensityType ?? ''] ?? 'run';

    if (tipo === 'run') {
      repeticaoNumero++;
    }
    const contaComoRepeticao =
      tipo === 'run' || (tipo === 'recovery' && repeticaoNumero > 0);

    return {
      ordem: indice + 1,
      tipo,
      repeticaoNumero: contaComoRepeticao ? repeticaoNumero : null,
      tempoSegundos: lap.duration ? Math.round(lap.duration) : undefined,
      distanciaKm: lap.distance ? lap.distance / 1000 : undefined,
      paceMedio: formatarPace(lap.averageSpeed),
      fcMedia: lap.averageHR ? Math.round(lap.averageHR) : undefined,
    };
  });
}
