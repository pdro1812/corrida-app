import {
  TreinoPrevisto,
  TreinoPrevistoIntervalo,
  TreinoRealizadoIntervalo,
} from '../types/api';
import { paceParaSegundos } from './comparacao';

export interface RepeticaoComparada {
  numero: number;
  tipo: 'tiro' | 'trote';
  previsto: TreinoPrevistoIntervalo | null;
  realizado: TreinoRealizadoIntervalo | null;
  dentroDaMeta: boolean | null; // null = sem dado suficiente pra avaliar
}

// RF22: casa cada tiro/trote previsto com o intervalo realizado
// correspondente. O Garmin não distingue tiro de trote de recuperação no
// campo `tipo` (ambos vêm como 'run' — só marca WARMUP/COOLDOWN de forma
// confiável, nunca REST, mesmo quando a atividade claramente alterna
// ritmo forte/fraco), então o `repeticaoNumero` do lado realizado é só
// uma contagem sequencial de todos os laps 'run', não alinhada com o
// `repeticaoNumero` do previsto (que numera só os tiros). A heurística
// usada aqui: dentro da sequência de laps 'run' (excluindo aquecimento/
// desaquecimento), eles alternam tiro/trote começando pelo tiro — testado
// contra dados reais da conta (10x400m) e bateu 100% com os 10 tiros e 10
// trotes esperados. Quando a atividade real tiver menos repetições que o
// previsto (parou no meio, GPS falhou etc.), casamos por posição e o
// restante fica "sem correspondência" em vez de esconder a repetição.
export function montarComparacaoTiros(treino: TreinoPrevisto): RepeticaoComparada[] {
  const tirosPrevistos = ordenarPorRepeticao(
    (treino.intervalos ?? []).filter((intervalo) => intervalo.tipo === 'tiro'),
  );
  const trotesPrevistos = ordenarPorRepeticao(
    (treino.intervalos ?? []).filter((intervalo) => intervalo.tipo === 'recuperacao'),
  );

  // Pode haver mais de um treino_realizado vinculado ao mesmo previsto
  // (ex: Garmin dividiu o treino em duas atividades) — junta os
  // intervalos de todos pra não perder repetições da segunda atividade.
  const lapsCorrida = treino.realizados
    .flatMap((realizado) => realizado.intervalos ?? [])
    .filter((intervalo) => intervalo.tipo === 'run')
    .sort((a, b) => a.ordem - b.ordem);

  const tirosRealizados = lapsCorrida.filter((_, indice) => indice % 2 === 0);
  const trotesRealizados = lapsCorrida.filter((_, indice) => indice % 2 === 1);

  const totalRepeticoes = Math.max(tirosPrevistos.length, tirosRealizados.length);
  const linhas: RepeticaoComparada[] = [];

  for (let i = 0; i < totalRepeticoes; i++) {
    linhas.push(
      montarLinha(i + 1, 'tiro', tirosPrevistos[i] ?? null, tirosRealizados[i] ?? null),
    );
    if (i < trotesPrevistos.length || i < trotesRealizados.length) {
      linhas.push(
        montarLinha(i + 1, 'trote', trotesPrevistos[i] ?? null, trotesRealizados[i] ?? null),
      );
    }
  }

  return linhas;
}

function montarLinha(
  numero: number,
  tipo: 'tiro' | 'trote',
  previsto: TreinoPrevistoIntervalo | null,
  realizado: TreinoRealizadoIntervalo | null,
): RepeticaoComparada {
  let dentroDaMeta: boolean | null = null;
  if (previsto && realizado?.paceMedio) {
    const min = paceParaSegundos(previsto.paceAlvoMin);
    const max = paceParaSegundos(previsto.paceAlvoMax);
    const realizadoSegundos = paceParaSegundos(realizado.paceMedio);
    if (min !== null && max !== null && realizadoSegundos !== null) {
      dentroDaMeta = realizadoSegundos >= min && realizadoSegundos <= max;
    }
  }

  return { numero, tipo, previsto, realizado, dentroDaMeta };
}

function ordenarPorRepeticao(
  intervalos: TreinoPrevistoIntervalo[],
): TreinoPrevistoIntervalo[] {
  return [...intervalos].sort(
    (a, b) => (a.repeticaoNumero ?? a.ordem) - (b.repeticaoNumero ?? b.ordem),
  );
}
