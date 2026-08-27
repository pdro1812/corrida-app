import { CreateTreinoPrevistoIntervaloDto } from '../../treinos/dto/create-treino-previsto-intervalo.dto';

// Reconhece blocos de repetição como "6x 1km (90s trote)" ou
// "10x 400m (1min trote)" — distância em km ou m, recuperação em s ou min.
const SEGMENTO_REPETICAO =
  /^(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(km|m)\s*\((\d+)\s*(s|min)\s*trote\)$/i;
const SEGMENTO_DISTANCIA = /^(\d+(?:[.,]\d+)?)\s*(km|m)\b/i;

function paraKm(valor: number, unidade: string): number {
  return unidade.toLowerCase() === 'm' ? valor / 1000 : valor;
}

function paraSegundos(valor: number, unidade: string): number {
  return unidade.toLowerCase() === 'min' ? valor * 60 : valor;
}

/**
 * Estrutura uma descrição de treino intervalado em texto livre
 * (ex: "2km Leve + 6x 1km (90s trote) + 1km Leve" ou
 * "2km Leve + 10x 400m (1min trote) + 1km Leve") em aquecimento,
 * tiros, recuperações e desaquecimento (RF08).
 *
 * Retorna `null` quando a descrição não contém nenhum bloco de
 * repetição reconhecível — nesse caso o treino não é intervalado
 * (ou o formato do texto foge do padrão suportado e precisa ser
 * ajustado manualmente depois do import).
 */
export function parseTreinoIntervalado(
  descricao: string,
): CreateTreinoPrevistoIntervaloDto[] | null {
  const segmentos = descricao
    .split('+')
    .map((segmento) => segmento.trim())
    .filter(Boolean);

  const temRepeticao = segmentos.some((segmento) =>
    SEGMENTO_REPETICAO.test(segmento),
  );
  if (!temRepeticao) {
    return null;
  }

  const intervalos: CreateTreinoPrevistoIntervaloDto[] = [];
  let ordem = 1;
  let repeticaoNumero = 1;

  segmentos.forEach((segmento, indice) => {
    const repeticaoMatch = SEGMENTO_REPETICAO.exec(segmento);
    if (repeticaoMatch) {
      const quantidade = parseInt(repeticaoMatch[1], 10);
      const distanciaKm = paraKm(
        parseFloat(repeticaoMatch[2].replace(',', '.')),
        repeticaoMatch[3],
      );
      const recuperacaoSegundos = paraSegundos(
        parseInt(repeticaoMatch[4], 10),
        repeticaoMatch[5],
      );

      for (let i = 0; i < quantidade; i++) {
        intervalos.push({
          ordem: ordem++,
          tipo: 'tiro',
          repeticaoNumero,
          distanciaAlvoKm: distanciaKm,
        });
        intervalos.push({
          ordem: ordem++,
          tipo: 'recuperacao',
          repeticaoNumero,
          duracaoAlvoSegundos: recuperacaoSegundos,
        });
        repeticaoNumero++;
      }
      return;
    }

    const distanciaMatch = SEGMENTO_DISTANCIA.exec(segmento);
    const distanciaKm = distanciaMatch
      ? paraKm(
          parseFloat(distanciaMatch[1].replace(',', '.')),
          distanciaMatch[2],
        )
      : undefined;
    const tipo = indice === 0 ? 'aquecimento' : 'desaquecimento';

    intervalos.push({ ordem: ordem++, tipo, distanciaAlvoKm: distanciaKm });
  });

  return intervalos;
}
