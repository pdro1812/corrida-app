import { TreinoRealizado } from '../types/modelo';

export interface VolumeSemana {
  inicio: string; // segunda-feira da semana, YYYY-MM-DD
  km: number;
  duracaoSegundos: number;
  elevacaoM: number;
  treinos: number;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Trabalha só com o dia (UTC) para não deslocar a semana por fuso: `data`
// do treino vem como "2026-11-07T00:00:00.000Z", e "hoje" usa o dia local.
function segundaDaSemana(diaUtcMs: number): number {
  const diaDaSemana = new Date(diaUtcMs).getUTCDay(); // 0 = domingo
  return diaUtcMs - ((diaDaSemana + 6) % 7) * UM_DIA_MS;
}

function paraIso(diaUtcMs: number): string {
  return new Date(diaUtcMs).toISOString().slice(0, 10);
}

// Volume por semana (segunda a domingo) das últimas N semanas, incluindo a
// atual — semanas sem treino entram zeradas para o gráfico não "pular" uma
// semana parada. Independe do ciclo: conta todo treino realizado.
export function calcularVolumeSemanal(
  treinos: TreinoRealizado[],
  quantidadeSemanas = 12,
  hoje: Date = new Date(),
): VolumeSemana[] {
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const semanaAtual = segundaDaSemana(hojeUtc);

  const semanas: VolumeSemana[] = [];
  const porInicio = new Map<string, VolumeSemana>();
  for (let i = quantidadeSemanas - 1; i >= 0; i--) {
    const semana: VolumeSemana = {
      inicio: paraIso(semanaAtual - i * 7 * UM_DIA_MS),
      km: 0,
      duracaoSegundos: 0,
      elevacaoM: 0,
      treinos: 0,
    };
    semanas.push(semana);
    porInicio.set(semana.inicio, semana);
  }

  for (const treino of treinos) {
    const dia = Date.parse(`${treino.data.slice(0, 10)}T00:00:00Z`);
    const semana = porInicio.get(paraIso(segundaDaSemana(dia)));
    if (!semana) continue;
    semana.km += treino.distanciaKm ?? 0;
    semana.duracaoSegundos += treino.duracaoSegundos ?? 0;
    semana.elevacaoM += treino.elevacaoM ?? 0;
    semana.treinos++;
  }

  return semanas;
}

// "3h 26m" / "48m" — formato compacto para totais da semana.
export function formatarDuracaoCompacta(segundos: number): string {
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  return horas > 0 ? `${horas}h ${minutos.toString().padStart(2, '0')}m` : `${minutos}m`;
}
