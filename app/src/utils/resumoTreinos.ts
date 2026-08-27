import { TreinoRealizadoComPrevisto } from '../types/api';

export interface ResumoRecente {
  quantidade: number;
  kmTotal: number;
  rpeMedio: number | null;
  sensacaoMaisComum: string | null;
}

// Resumo dos N treinos mais recentes (a lista já vem ordenada por data
// desc do backend) — usado no topo do Diário de Treinos como um "como eu
// estou indo ultimamente" rápido de ler.
export function calcularResumoRecente(
  treinos: TreinoRealizadoComPrevisto[],
  quantidade = 7,
): ResumoRecente {
  const recentes = treinos.slice(0, quantidade);
  const kmTotal = recentes.reduce((soma, treino) => soma + (treino.distanciaKm ?? 0), 0);

  const comRpe = recentes.filter((treino): treino is typeof treino & { rpe: number } => treino.rpe !== null);
  const rpeMedio =
    comRpe.length > 0
      ? comRpe.reduce((soma, treino) => soma + treino.rpe, 0) / comRpe.length
      : null;

  const contagemSensacoes = new Map<string, number>();
  for (const treino of recentes) {
    for (const sensacao of treino.sensacoes) {
      contagemSensacoes.set(sensacao, (contagemSensacoes.get(sensacao) ?? 0) + 1);
    }
  }
  const sensacaoMaisComum =
    [...contagemSensacoes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { quantidade: recentes.length, kmTotal, rpeMedio, sensacaoMaisComum };
}

// Cor por faixa de RPE (1-10) — usada pro badge no Diário de Treinos.
export function corDoRpe(rpe: number): string {
  if (rpe <= 3) return '#16a34a'; // leve
  if (rpe <= 6) return '#2563eb'; // moderado
  if (rpe <= 8) return '#d97706'; // forte
  return '#dc2626'; // máximo
}
