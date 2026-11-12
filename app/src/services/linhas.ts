import { randomUUID } from 'expo-crypto';
import type {
  Ciclo,
  Prova,
  TreinoPrevisto,
  TreinoPrevistoIntervalo,
  TreinoRealizado,
  TreinoRealizadoIntervalo,
} from '../types/modelo';

// Conversão entre as linhas do SQLite (snake_case) e os tipos de domínio
// usados pelas telas (camelCase), mais utilitários comuns aos serviços.

export const novoId = (): string => randomUUID();

export const agoraIso = (): string => new Date().toISOString();

// Normaliza qualquer data recebida das telas para 'YYYY-MM-DD'.
export function soData(valor: string): string {
  const data = valor.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) {
    throw new Error(`Data inválida: "${valor}" (use AAAA-MM-DD)`);
  }
  return data;
}

export function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export class NaoEncontradoError extends Error {
  constructor(entidade: string, id: string) {
    super(`${entidade} ${id} não encontrado(a)`);
    this.name = 'NaoEncontradoError';
  }
}

export interface LinhaCiclo {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  status: Ciclo['status'];
  criado_em: string;
}

export interface LinhaProva {
  id: string;
  ciclo_id: string | null;
  tipo: Prova['tipo'];
  nome: string;
  data: string;
  distancia_km: number | null;
  meta_tempo_segundos: number | null;
  resultado_tempo_segundos: number | null;
  resultado_pace: string | null;
  concluida: number;
}

export interface LinhaTreinoPrevisto {
  id: string;
  semana_id: string;
  dia_semana: string;
  data: string;
  tipo: TreinoPrevisto['tipo'];
  descricao: string;
  distancia_alvo_km: number | null;
  duracao_alvo_segundos: number | null;
  pace_alvo_min: string | null;
  pace_alvo_max: string | null;
  status: TreinoPrevisto['status'];
  motivo_nao_realizado: string | null;
}

export interface LinhaIntervaloPrevisto {
  id: string;
  treino_previsto_id: string;
  ordem: number;
  tipo: TreinoPrevistoIntervalo['tipo'];
  repeticao_numero: number | null;
  distancia_alvo_km: number | null;
  duracao_alvo_segundos: number | null;
  pace_alvo_min: string | null;
  pace_alvo_max: string | null;
}

export interface LinhaTreinoRealizado {
  id: string;
  treino_previsto_id: string | null;
  garmin_activity_id: string | null;
  fonte: TreinoRealizado['fonte'];
  data: string;
  distancia_km: number | null;
  duracao_segundos: number | null;
  pace_medio: string | null;
  fc_media: number | null;
  fc_max: number | null;
  elevacao_m: number | null;
  rpe: number | null;
  sensacoes: string;
  feedback_texto: string | null;
  observacoes: string | null;
  criado_em: string;
}

export interface LinhaIntervaloRealizado {
  id: string;
  treino_realizado_id: string;
  ordem: number;
  tipo: TreinoRealizadoIntervalo['tipo'];
  repeticao_numero: number | null;
  tempo_segundos: number | null;
  distancia_km: number | null;
  pace_medio: string | null;
  fc_media: number | null;
}

export const paraCiclo = (l: LinhaCiclo, provas: Prova[]): Ciclo => ({
  id: l.id,
  nome: l.nome,
  dataInicio: l.data_inicio,
  dataFim: l.data_fim,
  status: l.status,
  criadoEm: l.criado_em,
  provas,
});

export const paraProva = (l: LinhaProva): Prova => ({
  id: l.id,
  cicloId: l.ciclo_id,
  tipo: l.tipo,
  nome: l.nome,
  data: l.data,
  distanciaKm: l.distancia_km,
  metaTempoSegundos: l.meta_tempo_segundos,
  resultadoTempoSegundos: l.resultado_tempo_segundos,
  resultadoPace: l.resultado_pace,
  concluida: l.concluida === 1,
});

export const paraTreinoPrevisto = (l: LinhaTreinoPrevisto): TreinoPrevisto => ({
  id: l.id,
  semanaId: l.semana_id,
  diaSemana: l.dia_semana,
  data: l.data,
  tipo: l.tipo,
  descricao: l.descricao,
  distanciaAlvoKm: l.distancia_alvo_km,
  duracaoAlvoSegundos: l.duracao_alvo_segundos,
  paceAlvoMin: l.pace_alvo_min,
  paceAlvoMax: l.pace_alvo_max,
  status: l.status,
  motivoNaoRealizado: l.motivo_nao_realizado,
  intervalos: [],
  realizados: [],
});

export const paraIntervaloPrevisto = (l: LinhaIntervaloPrevisto): TreinoPrevistoIntervalo => ({
  id: l.id,
  treinoPrevistoId: l.treino_previsto_id,
  ordem: l.ordem,
  tipo: l.tipo,
  repeticaoNumero: l.repeticao_numero,
  distanciaAlvoKm: l.distancia_alvo_km,
  duracaoAlvoSegundos: l.duracao_alvo_segundos,
  paceAlvoMin: l.pace_alvo_min,
  paceAlvoMax: l.pace_alvo_max,
});

function lerSensacoes(json: string): string[] {
  try {
    const valor: unknown = JSON.parse(json);
    return Array.isArray(valor) ? valor.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const paraTreinoRealizado = (l: LinhaTreinoRealizado): TreinoRealizado => ({
  id: l.id,
  treinoPrevistoId: l.treino_previsto_id,
  garminActivityId: l.garmin_activity_id,
  fonte: l.fonte,
  data: l.data,
  distanciaKm: l.distancia_km,
  duracaoSegundos: l.duracao_segundos,
  paceMedio: l.pace_medio,
  fcMedia: l.fc_media,
  fcMax: l.fc_max,
  elevacaoM: l.elevacao_m,
  rpe: l.rpe,
  sensacoes: lerSensacoes(l.sensacoes),
  feedbackTexto: l.feedback_texto,
  observacoes: l.observacoes,
  criadoEm: l.criado_em,
});

export const paraIntervaloRealizado = (l: LinhaIntervaloRealizado): TreinoRealizadoIntervalo => ({
  id: l.id,
  treinoRealizadoId: l.treino_realizado_id,
  ordem: l.ordem,
  tipo: l.tipo,
  repeticaoNumero: l.repeticao_numero,
  tempoSegundos: l.tempo_segundos,
  distanciaKm: l.distancia_km,
  paceMedio: l.pace_medio,
  fcMedia: l.fc_media,
});

// Agrupa linhas por uma chave (ex: intervalos por treino) num único passe.
export function agruparPor<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const grupo = mapa.get(k);
    if (grupo) grupo.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

// "?, ?, ?" para cláusulas IN.
export const marcadores = (quantidade: number): string => Array(quantidade).fill('?').join(', ');
