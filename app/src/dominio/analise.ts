import { ResumoBemEstarDia } from './bemEstar';
import { calcularCustoEsforco, CustoEsforco, indiceCustoRelativo } from './custoEsforco';
import type { TreinoParaExport } from './exportIa';

// v2: cálculos compartilhados entre o export para o Claude e a tela Lab.
// Lógica pura, sem I/O.

export interface TreinoAnalisado {
  treino: TreinoParaExport;
  tipo: string;
  custo: CustoEsforco;
  indice: number | null; // 100 = custo típico para o tipo
}

// Custo ajustado de cada treino e índice contra o histórico ANTERIOR do
// mesmo tipo (nunca usa treinos futuros, para a curva ser honesta).
export function analisarTreinos(treinosEntrada: TreinoParaExport[]): TreinoAnalisado[] {
  const treinos = [...treinosEntrada].sort((a, b) => a.data.localeCompare(b.data));
  const historicoPorTipo = new Map<string, (number | null)[]>();
  return treinos.map((t) => {
    const custo = calcularCustoEsforco({
      distanciaKm: t.distanciaKm,
      duracaoSegundos: t.duracaoSegundos,
      fcMedia: t.fcMedia,
      elevacaoM: t.elevacaoM,
      rpe: t.rpe,
      desacoplamentoPct: t.desacoplamentoPct,
      temperaturaC: t.temperaturaC,
    });
    const tipo = t.tipoPrevisto ?? 'sem_plano';
    const historico = historicoPorTipo.get(tipo) ?? [];
    const indice = indiceCustoRelativo(custo.batimentosPorKmAjustado, historico);
    historicoPorTipo.set(tipo, [...historico, custo.batimentosPorKmAjustado]);
    return { treino: t, tipo, custo, indice };
  });
}

export interface Prontidao {
  data: string | null;
  sonoHoras: number | null;
  hrvNoite: number | null;
  hrvVariacaoPct: number | null; // vs média dos 7 dias anteriores
  fcRepouso: number | null;
  fcRepousoVariacao: number | null; // bpm vs média dos 7 dias anteriores
  bodyBatteryMax: number | null;
}

const media = (valores: (number | null)[]) => {
  const v = valores.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// Último dia com dados, comparado com a semana anterior: HRV abaixo e FC
// de repouso acima da sua média são sinais clássicos de fadiga.
export function calcularProntidao(dias: ResumoBemEstarDia[]): Prontidao {
  const ordenados = [...dias].sort((a, b) => a.data.localeCompare(b.data));
  let indice = ordenados.length - 1;
  while (indice >= 0 && ordenados[indice].hrvNoite === null && ordenados[indice].sonoHoras === null && ordenados[indice].fcRepouso === null) {
    indice--;
  }
  if (indice < 0) {
    return { data: null, sonoHoras: null, hrvNoite: null, hrvVariacaoPct: null, fcRepouso: null, fcRepousoVariacao: null, bodyBatteryMax: null };
  }
  const hoje = ordenados[indice];
  const anteriores = ordenados.slice(Math.max(0, indice - 7), indice);
  const hrvMedia = media(anteriores.map((d) => d.hrvNoite));
  const fcMedia = media(anteriores.map((d) => d.fcRepouso));
  return {
    data: hoje.data,
    sonoHoras: hoje.sonoHoras,
    hrvNoite: hoje.hrvNoite,
    hrvVariacaoPct:
      hoje.hrvNoite !== null && hrvMedia ? Math.round(((hoje.hrvNoite - hrvMedia) / hrvMedia) * 100) : null,
    fcRepouso: hoje.fcRepouso,
    fcRepousoVariacao: hoje.fcRepouso !== null && fcMedia !== null ? Math.round(hoje.fcRepouso - fcMedia) : null,
    bodyBatteryMax: hoje.bodyBatteryMax,
  };
}
