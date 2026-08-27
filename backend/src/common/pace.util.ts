// Pace assumido quando a planilha não informa nenhum pace alvo pro treino
// (ex: treino "por tempo" sem faixa de pace) nem pro trote de recuperação
// entre tiros (que nunca tem pace próprio no modelo) — decisão do dono do
// projeto pra não deixar esses trechos de fora do km total estimado.
export const PACE_PADRAO_SEGUNDOS_POR_KM = 5 * 60 + 30; // 5:30/km

// Converte pace no formato "M:SS" (ex: "5:15") pra segundos por km.
export function paceParaSegundosPorKm(pace?: string | null): number | null {
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

// Média da faixa de pace alvo (min-max) — usada pra estimar distância de
// treinos descritos só por duração (ex: "45 min Leve"), ver semanas.service.ts.
export function paceMedioSegundosPorKm(
  paceMin?: string | null,
  paceMax?: string | null,
): number | null {
  const min = paceParaSegundosPorKm(paceMin);
  const max = paceParaSegundosPorKm(paceMax);
  if (min !== null && max !== null) {
    return (min + max) / 2;
  }
  return min ?? max;
}
