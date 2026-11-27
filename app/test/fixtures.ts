import { AmostraCompleta, LapTempo } from '../src/dominio/blocosFit';

// Gera amostras de 1 s para um trecho de velocidade e FC constantes.
export function trecho(
  inicio: number,
  segundos: number,
  vel: number,
  fc: (i: number) => number,
  distInicial: number,
  alt = 0,
): AmostraCompleta[] {
  return Array.from({ length: segundos }, (_, i) => ({
    t: inicio + i,
    vel,
    fc: fc(i),
    dist: distInicial + vel * i,
    alt,
    cad: vel > 4 ? 184 : 170,
  }));
}

// Treino de tiro sintético: 10 min aq, 4 x (90 s tiro + 60 s trote),
// 5 min desaq e um sprint de 20 s não planejado no fim.
export function treinoDeTiro(): { amostras: AmostraCompleta[]; laps: LapTempo[] } {
  const amostras: AmostraCompleta[] = [];
  const laps: LapTempo[] = [];
  let t = 0;
  let d = 0;
  const add = (seg: number, vel: number, fc: (i: number) => number, tipo: LapTempo['tipo'] | null) => {
    amostras.push(...trecho(t, seg, vel, fc, d));
    if (tipo) laps.push({ inicio: t, fim: t + seg, tipo });
    t += seg;
    d += vel * seg;
  };
  add(600, 3, () => 140, 'warmup');
  for (let r = 0; r < 4; r++) {
    add(90, 4.5, (i) => Math.min(150 + i, 165 + r), 'run');
    add(60, 2.5, (i) => 165 - Math.round(i / 2), 'recovery');
  }
  const inicioDes = t;
  add(300, 2.8, () => 138, null);
  add(20, 5.6, () => 150, null);
  laps.push({ inicio: inicioDes, fim: t, tipo: 'cooldown' });
  return { amostras, laps };
}
