import { Decoder, Stream } from '@garmin/fitsdk';
import { amostrasCompletasDosRecords } from './blocosFit';

// Trecho mais rápido de uma distância dentro de uma atividade (ex.: o
// melhor 10 km dentro de um longão), a partir das amostras do FIT.
// O tempo é corrido (pausas no meio do trecho contam), como num recorde.
export function melhorTrecho(amostras: { t: number; dist?: number }[], metros: number): { segundos: number; inicioM: number } | null {
  const pts = amostras
    .filter((a): a is { t: number; dist: number } => a.dist !== undefined && Number.isFinite(a.dist))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2 || pts[pts.length - 1].dist - pts[0].dist < metros) return null;
  let melhor: { segundos: number; inicioM: number } | null = null;
  let i = 0;
  for (let j = 1; j < pts.length; j++) {
    const alvo = pts[j].dist - metros; // onde o trecho que termina em j começa
    if (alvo < pts[0].dist) continue;
    while (i + 1 < j && pts[i + 1].dist <= alvo) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const fracao = b.dist > a.dist ? (alvo - a.dist) / (b.dist - a.dist) : 0;
    const tInicio = a.t + fracao * (b.t - a.t);
    const segundos = pts[j].t - tInicio;
    if (segundos > 0 && (!melhor || segundos < melhor.segundos)) melhor = { segundos, inicioM: alvo };
  }
  return melhor && { segundos: Math.round(melhor.segundos), inicioM: Math.round(melhor.inicioM) };
}

export function melhorTrechoDoFit(fit: Uint8Array, metros: number) {
  const { messages, errors } = new Decoder(Stream.fromBuffer(fit)).read();
  if (errors.length > 0) throw new Error(`Arquivo FIT inválido: ${String(errors[0])}`);
  return melhorTrecho(amostrasCompletasDosRecords(messages.recordMesgs ?? []).amostras, metros);
}
