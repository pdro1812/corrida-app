import { Semana } from '../types/modelo';
import { semanasEntre } from '../dominio/blocosCiclo';
import { agregarRealizados } from './comparacao';

export interface ResumoBloco {
  semanas: number;
  kmPrevisto: number;
  kmRealizado: number;
  treinosElegiveis: number; // previstos até hoje, sem contar descanso
  treinosFeitos: number;
  maiorLongaoKm: number | null;
  rpeMedio: number | null;
}

// Números de um bloco a partir das semanas do ciclo que começam dentro dele.
export function resumirBloco(bloco: { dataInicio: string; dataFim: string }, semanas: Semana[], hoje: string): ResumoBloco {
  const dentro = semanas.filter((s) => {
    const inicio = s.dataInicio.slice(0, 10);
    return bloco.dataInicio <= inicio && inicio <= bloco.dataFim;
  });
  const treinos = dentro.flatMap((s) => s.treinosPrevistos);
  const elegiveis = treinos.filter((t) => t.tipo !== 'descanso' && t.data.slice(0, 10) <= hoje);
  const realizados = treinos.flatMap((t) => t.realizados);
  const rpes = realizados.map((r) => r.rpe).filter((r): r is number => r !== null);
  const longoes = treinos
    .filter((t) => t.tipo === 'longo')
    .map((t) => agregarRealizados(t.realizados).distanciaKm)
    .filter((km) => km > 0);
  return {
    semanas: semanasEntre(bloco.dataInicio, bloco.dataFim),
    kmPrevisto: dentro.reduce((total, s) => total + s.kmPlanejadoTotal, 0),
    kmRealizado: treinos.reduce((total, t) => total + agregarRealizados(t.realizados).distanciaKm, 0),
    treinosElegiveis: elegiveis.length,
    treinosFeitos: elegiveis.filter((t) => t.realizados.length > 0).length,
    maiorLongaoKm: longoes.length ? Math.max(...longoes) : null,
    rpeMedio: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
  };
}
