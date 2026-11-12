// Regras de leitura de pace e de descrições de treino em texto livre
// (planilha original) — usadas no import (RF05/RF08) e na estimativa de km
// planejado (RF20).

// Pace assumido quando a planilha não informa nenhum pace alvo (treino "por
// tempo" sem faixa) nem para o trote de recuperação entre tiros — decisão do
// dono do projeto para esses trechos não ficarem de fora do km estimado.
export const PACE_PADRAO_SEGUNDOS_POR_KM = 5 * 60 + 30; // 5:30/km

// "5:15" -> 315
export function paceParaSegundosPorKm(pace?: string | null): number | null {
  if (!pace) return null;
  const partes = pace.split(':');
  if (partes.length !== 2) return null;
  const [minutos, segundos] = partes.map(Number);
  if (Number.isNaN(minutos) || Number.isNaN(segundos)) return null;
  return minutos * 60 + segundos;
}

// Média da faixa de pace alvo (min-max).
export function paceMedioSegundosPorKm(paceMin?: string | null, paceMax?: string | null): number | null {
  const min = paceParaSegundosPorKm(paceMin);
  const max = paceParaSegundosPorKm(paceMax);
  if (min !== null && max !== null) return (min + max) / 2;
  return min ?? max;
}

// Velocidade (m/s) -> pace "M:SS" (min/km).
export function formatarPace(velocidadeMetrosPorSegundo: number | undefined): string | undefined {
  if (!velocidadeMetrosPorSegundo || velocidadeMetrosPorSegundo <= 0) return undefined;
  // Arredonda para segundos inteiros ANTES de separar min/seg — fazer o
  // round() depois do módulo pode estourar para "60" por ponto flutuante.
  const segundosPorKm = Math.round(1000 / velocidadeMetrosPorSegundo);
  const minutos = Math.floor(segundosPorKm / 60);
  const segundos = segundosPorKm % 60;
  return `${minutos}:${segundos.toString().padStart(2, '0')}`;
}

const PADRAO_HORAS_MINUTOS = /(\d+)\s*h\s*(\d+)?/i;
const PADRAO_MINUTOS = /(\d+)\s*min/i;

// Duração aproximada em minutos: "45 min Leve" -> 45, "1h30 Leve" -> 90.
export function extrairDuracaoMinutosDaDescricao(descricao: string): number | undefined {
  const horas = PADRAO_HORAS_MINUTOS.exec(descricao);
  if (horas) return Number(horas[1]) * 60 + (horas[2] ? Number(horas[2]) : 0);
  const minutos = PADRAO_MINUTOS.exec(descricao);
  return minutos ? Number(minutos[1]) : undefined;
}

const SEGMENTO_DISTANCIA = /^(\d+(?:[.,]\d+)?)\s*(km|m)\b/i;

function paraKm(valor: number, unidade: string): number {
  return unidade.toLowerCase() === 'm' ? valor / 1000 : valor;
}

// Soma distâncias de descrições sem bloco de repetição:
// "2km Leve + 6km Ritmo Prova + 1km Leve" -> 9.
export function somarDistanciasDaDescricao(descricao: string): number {
  return descricao
    .split('+')
    .map((segmento) => segmento.trim())
    .reduce((soma, segmento) => {
      const match = SEGMENTO_DISTANCIA.exec(segmento);
      return match ? soma + paraKm(parseFloat(match[1].replace(',', '.')), match[2]) : soma;
    }, 0);
}

export interface IntervaloPlanejado {
  ordem: number;
  tipo: 'aquecimento' | 'tiro' | 'recuperacao' | 'desaquecimento';
  repeticaoNumero?: number;
  distanciaAlvoKm?: number;
  duracaoAlvoSegundos?: number;
}

// "6x 1km (90s trote)" / "10x 400m (1min trote)"
const SEGMENTO_REPETICAO = /^(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(km|m)\s*\((\d+)\s*(s|min)\s*trote\)$/i;

// Estrutura um treino intervalado em aquecimento, tiros, recuperações e
// desaquecimento (RF08). Ex: "2km Leve + 6x 1km (90s trote) + 1km Leve".
// Retorna null quando não há bloco de repetição reconhecível.
export function parseTreinoIntervalado(descricao: string): IntervaloPlanejado[] | null {
  const segmentos = descricao
    .split('+')
    .map((segmento) => segmento.trim())
    .filter(Boolean);
  if (!segmentos.some((segmento) => SEGMENTO_REPETICAO.test(segmento))) return null;

  const intervalos: IntervaloPlanejado[] = [];
  let ordem = 1;
  let repeticaoNumero = 1;

  segmentos.forEach((segmento, indice) => {
    const repeticao = SEGMENTO_REPETICAO.exec(segmento);
    if (repeticao) {
      const quantidade = parseInt(repeticao[1], 10);
      const distanciaKm = paraKm(parseFloat(repeticao[2].replace(',', '.')), repeticao[3]);
      const recuperacao = parseInt(repeticao[4], 10) * (repeticao[5].toLowerCase() === 'min' ? 60 : 1);
      for (let i = 0; i < quantidade; i++) {
        intervalos.push({ ordem: ordem++, tipo: 'tiro', repeticaoNumero, distanciaAlvoKm: distanciaKm });
        intervalos.push({ ordem: ordem++, tipo: 'recuperacao', repeticaoNumero, duracaoAlvoSegundos: recuperacao });
        repeticaoNumero++;
      }
      return;
    }
    const distancia = SEGMENTO_DISTANCIA.exec(segmento);
    intervalos.push({
      ordem: ordem++,
      tipo: indice === 0 ? 'aquecimento' : 'desaquecimento',
      distanciaAlvoKm: distancia ? paraKm(parseFloat(distancia[1].replace(',', '.')), distancia[2]) : undefined,
    });
  });

  return intervalos;
}

interface TreinoParaEstimativa {
  descricao: string;
  distanciaAlvoKm: number | null;
  duracaoAlvoSegundos: number | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
  intervalos?: { distanciaAlvoKm: number | null; duracaoAlvoSegundos: number | null }[];
}

export function duracaoAlvoSegundos(treino: TreinoParaEstimativa): number {
  if (treino.duracaoAlvoSegundos) return treino.duracaoAlvoSegundos;
  const minutos = extrairDuracaoMinutosDaDescricao(treino.descricao);
  return minutos ? minutos * 60 : 0;
}

function somarIntervalos(intervalos: { distanciaAlvoKm?: number | null; duracaoAlvoSegundos?: number | null }[]): number {
  return intervalos.reduce((soma, intervalo) => {
    if (intervalo.distanciaAlvoKm) return soma + intervalo.distanciaAlvoKm;
    // Trote/recuperação nunca tem pace próprio — estima no pace padrão.
    if (intervalo.duracaoAlvoSegundos) return soma + intervalo.duracaoAlvoSegundos / PACE_PADRAO_SEGUNDOS_POR_KM;
    return soma;
  }, 0);
}

// Km de um treino previsto (RF20), mesmo quando ele não tem distância alvo
// explícita (treino só por tempo, intervalado sem total no cabeçalho...).
export function estimarKm(treino: TreinoParaEstimativa): number {
  if (treino.distanciaAlvoKm) return treino.distanciaAlvoKm;
  if (treino.intervalos && treino.intervalos.length > 0) return somarIntervalos(treino.intervalos);

  const intervalosDaDescricao = parseTreinoIntervalado(treino.descricao);
  if (intervalosDaDescricao) return somarIntervalos(intervalosDaDescricao);

  const distanciaDaDescricao = somarDistanciasDaDescricao(treino.descricao);
  if (distanciaDaDescricao > 0) return distanciaDaDescricao;

  const duracao = duracaoAlvoSegundos(treino);
  if (duracao) {
    const pace = paceMedioSegundosPorKm(treino.paceAlvoMin, treino.paceAlvoMax) ?? PACE_PADRAO_SEGUNDOS_POR_KM;
    return duracao / pace;
  }
  return 0;
}
