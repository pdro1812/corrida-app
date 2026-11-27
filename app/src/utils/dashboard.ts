import { Semana } from '../types/modelo';
import { agregarRealizados } from './comparacao';

// RF21: contagem regressiva até a data da prova alvo.
export function calcularDiasAteProva(dataProva: string | null): number | null {
  if (!dataProva) {
    return null;
  }
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const prova = new Date(dataProva);
  const provaUtc = Date.UTC(prova.getUTCFullYear(), prova.getUTCMonth(), prova.getUTCDate());
  return Math.round((provaUtc - hojeUtc) / (1000 * 60 * 60 * 24));
}

export interface ProgressoKm {
  kmPlanejadoTotal: number;
  kmRealizadoTotal: number;
}

// RF20: total de km realizados x planejados do ciclo ativo.
export function calcularProgressoKm(semanas: Semana[]): ProgressoKm {
  let kmPlanejadoTotal = 0;
  let kmRealizadoTotal = 0;

  for (const semana of semanas) {
    kmPlanejadoTotal += semana.kmPlanejadoTotal;
    for (const treino of semana.treinosPrevistos) {
      kmRealizadoTotal += agregarRealizados(treino.realizados).distanciaKm;
    }
  }

  return { kmPlanejadoTotal, kmRealizadoTotal };
}

// Km realizado de uma única semana (mesma lógica de calcularProgressoKm,
// mas por semana em vez de somar o ciclo inteiro) — usado na lista de
// semanas da Home pra mostrar "planejado x entregue" por linha.
export function calcularKmRealizadoDaSemana(semana: Semana): number {
  let kmRealizado = 0;
  for (const treino of semana.treinosPrevistos) {
    kmRealizado += agregarRealizados(treino.realizados).distanciaKm;
  }
  return kmRealizado;
}

export function semanaJaPassou(semana: Semana): boolean {
  const hojeISO = new Date().toISOString().slice(0, 10);
  return semana.dataFim.slice(0, 10) < hojeISO;
}

export function semanaEhAtual(semana: Semana): boolean {
  const hojeISO = new Date().toISOString().slice(0, 10);
  return semana.dataInicio.slice(0, 10) <= hojeISO && hojeISO <= semana.dataFim.slice(0, 10);
}

// Separa semanas já concluídas (dataFim no passado) das em andamento —
// a atual fica sempre no topo do primeiro grupo, e as concluídas vão
// pro final da lista (seção "Concluídas" na Home), mais recente primeiro.
export interface SemanasAgrupadas {
  emAndamento: Semana[];
  concluidas: Semana[];
}

export function agruparSemanasPorStatus(semanas: Semana[]): SemanasAgrupadas {
  const concluidas = semanas
    .filter(semanaJaPassou)
    .sort((a, b) => b.numeroSemana - a.numeroSemana);

  const restantes = semanas.filter((semana) => !semanaJaPassou(semana));
  const atual = restantes.find(semanaEhAtual);
  const emAndamento = atual
    ? [atual, ...restantes.filter((semana) => semana.id !== atual.id)]
    : restantes;

  return { emAndamento, concluidas };
}

export interface ContadorTreinos {
  total: number;
  concluidosAteAgora: number;
  restantesAteAgora: number;
}

// Total de treinos previstos no ciclo x quantos já foram concluídos até
// hoje (data <= hoje e não é "descanso") — mostrado como contador na Home.
export function calcularContadorTreinos(semanas: Semana[]): ContadorTreinos {
  const hojeISO = new Date().toISOString().slice(0, 10);
  let total = 0;
  let concluidosAteAgora = 0;
  let restantesAteAgora = 0;

  for (const semana of semanas) {
    for (const treino of semana.treinosPrevistos) {
      if (treino.tipo === 'descanso') {
        continue;
      }
      total++;
      if (treino.status === 'realizado') {
        concluidosAteAgora++;
      } else if (treino.data.slice(0, 10) <= hojeISO) {
        restantesAteAgora++;
      }
    }
  }

  return { total, concluidosAteAgora, restantesAteAgora };
}

export interface AderenciaSemana {
  semana: Semana | null;
  elegiveis: number;
  realizados: number;
}

// Aderência da semana atual (RF19 no dashboard): dos treinos já vencidos
// (data <= hoje) e que não são descanso, quantos foram realizados.
export function calcularAderenciaSemanaAtual(semanas: Semana[]): AderenciaSemana {
  const hoje = new Date();
  const hojeISO = hoje.toISOString().slice(0, 10);

  const semanaAtual = semanas.find(
    (semana) => semana.dataInicio.slice(0, 10) <= hojeISO && hojeISO <= semana.dataFim.slice(0, 10),
  );

  if (!semanaAtual) {
    return { semana: null, elegiveis: 0, realizados: 0 };
  }

  const elegiveis = semanaAtual.treinosPrevistos.filter(
    (treino) => treino.tipo !== 'descanso' && treino.data.slice(0, 10) <= hojeISO,
  );
  const realizados = elegiveis.filter((treino) => treino.realizados.length > 0);

  return { semana: semanaAtual, elegiveis: elegiveis.length, realizados: realizados.length };
}
