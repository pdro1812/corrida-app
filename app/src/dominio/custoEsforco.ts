// v2: "custo de esforço" — o quanto custou sustentar um treino, comparado
// com treinos parecidos em outros dias. Lógica pura, sem I/O.

export interface DadosEsforco {
  distanciaKm: number | null;
  duracaoSegundos: number | null;
  fcMedia: number | null;
  elevacaoM: number | null;
  rpe: number | null; // 0 a 10
  desacoplamentoPct: number | null;
  temperaturaC: number | null; // do clima (Open-Meteo), não do relógio
}

export interface CustoEsforco {
  batimentosPorKm: number | null;
  fatorEficiencia: number | null; // metros por minuto / FC — maior = mais eficiente
  cargaSessao: number | null; // sRPE de Foster: RPE x minutos
  // Batimentos por km ajustados por subida e calor, para comparar dias.
  batimentosPorKmAjustado: number | null;
}

// Cada 10 m de subida por km custa ~1% a mais; acima de 15 °C, ~1% a mais
// por grau. Aproximações conservadoras da literatura (pace ajustado por
// subida e por calor), suficientes para comparar o mesmo atleta.
const CUSTO_SUBIDA_POR_M_KM = 0.001;
const TEMPERATURA_NEUTRA_C = 15;
const CUSTO_CALOR_POR_GRAU = 0.01;

export function calcularCustoEsforco(dados: DadosEsforco): CustoEsforco {
  const { distanciaKm, duracaoSegundos, fcMedia, rpe } = dados;
  const minutos = duracaoSegundos ? duracaoSegundos / 60 : null;
  const temDistancia = distanciaKm !== null && distanciaKm > 0.2;

  const batimentosPorKm = temDistancia && minutos && fcMedia ? (fcMedia * minutos) / distanciaKm : null;
  const fatorEficiencia = temDistancia && minutos && fcMedia ? (distanciaKm * 1000) / minutos / fcMedia : null;
  const cargaSessao = rpe !== null && minutos ? rpe * minutos : null;

  let batimentosPorKmAjustado: number | null = null;
  if (batimentosPorKm !== null && temDistancia) {
    const subidaPorKm = (dados.elevacaoM ?? 0) / distanciaKm;
    const calor = Math.max(0, (dados.temperaturaC ?? TEMPERATURA_NEUTRA_C) - TEMPERATURA_NEUTRA_C);
    const fator = 1 + subidaPorKm * CUSTO_SUBIDA_POR_M_KM + calor * CUSTO_CALOR_POR_GRAU;
    batimentosPorKmAjustado = batimentosPorKm / fator;
  }

  const arredonda = (v: number | null, casas: number) => (v === null ? null : Number(v.toFixed(casas)));
  return {
    batimentosPorKm: arredonda(batimentosPorKm, 0),
    fatorEficiencia: arredonda(fatorEficiencia, 3),
    cargaSessao: arredonda(cargaSessao, 0),
    batimentosPorKmAjustado: arredonda(batimentosPorKmAjustado, 0),
  };
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

// Índice relativo: 100 = custo típico seu para esse tipo de treino; 110 =
// custou 10% mais batimentos por km (já ajustado por subida e calor).
// Usa a mediana do histórico para não ser puxado por um dia atípico. Pede
// pelo menos 3 treinos de referência.
export function indiceCustoRelativo(atual: number | null, historico: (number | null)[]): number | null {
  const referencia = mediana(historico.filter((v): v is number => v !== null));
  if (atual === null || referencia === null || historico.filter((v) => v !== null).length < 3) return null;
  return Math.round((atual / referencia) * 100);
}
