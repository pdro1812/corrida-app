// Tipos espelhando as respostas do backend (ver backend/prisma/schema.prisma
// e os DTOs em backend/src/*). Nomes de domínio em português, como no resto
// do projeto (ver CLAUDE.md).

export type StatusCiclo = 'ativo' | 'concluido' | 'cancelado';
export type StatusTreinoPrevisto = 'pendente' | 'realizado' | 'nao_realizado' | 'parcial';
export type TipoTreino = 'rodagem' | 'qualidade' | 'longo' | 'descanso';
export type TipoIntervalo = 'aquecimento' | 'tiro' | 'recuperacao' | 'desaquecimento';
export type TipoIntervaloRealizado = 'warmup' | 'run' | 'recovery' | 'cooldown';
export type TipoProva = 'alvo' | 'secundaria';
export type FonteTreinoRealizado = 'garmin' | 'manual';

// O ciclo não guarda a prova alvo diretamente — ela é a Prova (tipo='alvo')
// dentro de `provas`, sempre incluída pelo backend. Ver docs/DATA_MODEL.md.
export interface Ciclo {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  status: StatusCiclo;
  criadoEm: string;
  provas: Prova[];
}

export interface Prova {
  id: string;
  cicloId: string | null;
  tipo: TipoProva;
  nome: string;
  data: string;
  distanciaKm: number | null;
  metaTempoSegundos: number | null;
  resultadoTempoSegundos: number | null;
  resultadoPace: string | null;
  concluida: boolean;
}

export function provaAlvoDoCiclo(ciclo: Pick<Ciclo, 'provas'>): Prova | null {
  return ciclo.provas.find((prova) => prova.tipo === 'alvo') ?? null;
}

export interface TreinoPrevistoIntervalo {
  id: string;
  treinoPrevistoId: string;
  ordem: number;
  tipo: TipoIntervalo;
  repeticaoNumero: number | null;
  distanciaAlvoKm: number | null;
  duracaoAlvoSegundos: number | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
}

export interface TreinoPrevisto {
  id: string;
  semanaId: string;
  diaSemana: string;
  data: string;
  tipo: TipoTreino | null;
  descricao: string;
  distanciaAlvoKm: number | null;
  duracaoAlvoSegundos: number | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
  status: StatusTreinoPrevisto;
  motivoNaoRealizado: string | null;
  intervalos?: TreinoPrevistoIntervalo[];
  realizados: TreinoRealizado[];
}

export interface Semana {
  id: string;
  cicloId: string;
  numeroSemana: number;
  dataInicio: string;
  dataFim: string;
  fase: string | null;
  rotinaExtra: string | null;
  treinosPrevistos: TreinoPrevisto[];
  // Calculados no backend a partir dos treinosPrevistos — nunca
  // armazenados (ver docs/DATA_MODEL.md).
  kmPlanejadoTotal: number;
  tempoPlanejadoTotalSegundos: number;
}

export interface TreinoRealizadoIntervalo {
  id: string;
  treinoRealizadoId: string;
  ordem: number;
  tipo: TipoIntervaloRealizado;
  repeticaoNumero: number | null;
  tempoSegundos: number | null;
  distanciaKm: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
}

export interface TreinoRealizado {
  id: string;
  treinoPrevistoId: string | null;
  garminActivityId: string | null;
  fonte: FonteTreinoRealizado;
  data: string;
  distanciaKm: number | null;
  duracaoSegundos: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
  fcMax: number | null;
  elevacaoM: number | null;
  rpe: number | null;
  sensacoes: string[];
  feedbackTexto: string | null;
  observacoes: string | null;
  criadoEm: string;
  intervalos?: TreinoRealizadoIntervalo[];
}

// Retorno de GET /treinos-realizados — inclui o treino previsto casado
// (RF15), só com os campos escalares (sem os relacionamentos dele).
export interface TreinoRealizadoComPrevisto extends TreinoRealizado {
  treinoPrevisto: Pick<
    TreinoPrevisto,
    'id' | 'semanaId' | 'diaSemana' | 'data' | 'tipo' | 'descricao'
  > | null;
}

export interface ResultadoSincronizacao {
  ok: boolean;
  atividadesEncontradas: number;
  atividadesImportadas: number;
  atividadesJaExistentes: number;
  treinosCasadosComPrevisto: number;
  erro?: string;
}
