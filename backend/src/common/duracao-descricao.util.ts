// Extrai duração aproximada (em minutos) de descrições em texto livre de
// treinos por tempo, ex: "45 min Leve" -> 45, "1h30 Leve" -> 90,
// "1h Leve" -> 60. Usado no import de planilha (RF05) pra treinos sem
// distância alvo, cuja descrição só tem tempo (ver semanas.service.ts
// pra como isso entra no total planejado da semana).
const PADRAO_HORAS_MINUTOS = /(\d+)\s*h\s*(\d+)?/i;
const PADRAO_MINUTOS = /(\d+)\s*min/i;

export function extrairDuracaoMinutosDaDescricao(
  descricao: string,
): number | undefined {
  const horas = PADRAO_HORAS_MINUTOS.exec(descricao);
  if (horas) {
    const h = Number(horas[1]);
    const m = horas[2] ? Number(horas[2]) : 0;
    return h * 60 + m;
  }
  const minutos = PADRAO_MINUTOS.exec(descricao);
  if (minutos) {
    return Number(minutos[1]);
  }
  return undefined;
}
