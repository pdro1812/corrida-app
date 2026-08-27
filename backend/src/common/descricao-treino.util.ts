// Soma distâncias reconhecíveis em descrições de treino sem estrutura de
// repetição (ex: "2km Leve + 6km Ritmo Prova + 1km Leve" -> 9), pra não
// ficar de fora do km total estimado (ver semanas.service.ts). Só entra
// em jogo quando o treino não tem distância alvo direta nem intervalos
// estruturados (RF08) — treinos com bloco "Nx" já são cobertos por
// treino_previsto_intervalo.
const SEGMENTO_DISTANCIA = /^(\d+(?:[.,]\d+)?)\s*(km|m)\b/i;

export function somarDistanciasDaDescricao(descricao: string): number {
  return descricao
    .split('+')
    .map((segmento) => segmento.trim())
    .reduce((soma, segmento) => {
      const match = SEGMENTO_DISTANCIA.exec(segmento);
      if (!match) {
        return soma;
      }
      const valor = parseFloat(match[1].replace(',', '.'));
      const unidade = match[2].toLowerCase();
      return soma + (unidade === 'm' ? valor / 1000 : valor);
    }, 0);
}
