import { TreinoPrevisto, TreinoRealizado } from '../types/modelo';

export function paceParaSegundos(pace: string | null | undefined): number | null {
  if (!pace) {
    return null;
  }
  const partes = pace.split(':');
  if (partes.length !== 2) {
    return null;
  }
  const [minutos, segundos] = partes.map(Number);
  if (Number.isNaN(minutos) || Number.isNaN(segundos)) {
    return null;
  }
  return minutos * 60 + segundos;
}

export function segundosParaPace(segundosPorKm: number | null): string | null {
  if (segundosPorKm === null || !Number.isFinite(segundosPorKm)) {
    return null;
  }
  const minutos = Math.floor(segundosPorKm / 60);
  const segundos = Math.round(segundosPorKm % 60);
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

export interface RealizadosAgregados {
  distanciaKm: number;
  duracaoSegundos: number;
  paceMedio: string | null;
}

// Um treino_previsto pode ter mais de um treino_realizado vinculado —
// típico quando o Garmin registra o mesmo treino como duas atividades
// separadas (ex: esqueceu de pausar/retomar). Em vez de tratar como
// duplicata, somamos tudo como se fosse uma sessão só.
export function agregarRealizados(realizados: TreinoRealizado[]): RealizadosAgregados {
  const distanciaKm = realizados.reduce((total, r) => total + (r.distanciaKm ?? 0), 0);
  const duracaoSegundos = realizados.reduce((total, r) => total + (r.duracaoSegundos ?? 0), 0);
  const paceMedio =
    distanciaKm > 0 ? segundosParaPace(duracaoSegundos / distanciaKm) : null;

  return { distanciaKm, duracaoSegundos, paceMedio };
}

export type StatusComparacao =
  | 'dentro_da_meta'
  | 'fora_da_meta'
  | 'nao_realizado'
  | 'sem_meta'
  | 'pendente';

// RF19: indicação visual de dentro/fora da meta ou não realizado.
export function calcularStatusComparacao(
  treino: TreinoPrevisto,
): StatusComparacao {
  if (treino.status === 'nao_realizado') {
    return 'nao_realizado';
  }

  if (treino.realizados.length === 0) {
    return 'pendente';
  }

  const { paceMedio } = agregarRealizados(treino.realizados);

  const min = paceParaSegundos(treino.paceAlvoMin);
  const max = paceParaSegundos(treino.paceAlvoMax);
  const realizadoSegundos = paceParaSegundos(paceMedio);

  if (min === null || max === null || realizadoSegundos === null) {
    return 'sem_meta';
  }

  return realizadoSegundos >= min && realizadoSegundos <= max
    ? 'dentro_da_meta'
    : 'fora_da_meta';
}

export const ICONE_STATUS: Record<StatusComparacao, string> = {
  dentro_da_meta: '✅',
  fora_da_meta: '⚠️',
  nao_realizado: '❌',
  sem_meta: '☑️',
  pendente: '⏳',
};
