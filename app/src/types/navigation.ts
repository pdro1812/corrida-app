import { NavigatorScreenParams } from '@react-navigation/native';
import { TreinoPrevisto } from './modelo';

// Quatro abas por tema. Hoje: o dia e a semana atual. Ciclo: semanas,
// blocos, provas, planilha e histórico. Treinos: diário e dados do Garmin.
// Análise: Lab, recordes e exportação para o Claude.
export type AbasParamList = {
  Hoje: undefined;
  Ciclo: undefined;
  Treinos: undefined;
  Analise: undefined;
};

// Pilha raiz: as abas e, por cima delas, as telas de detalhe/edição, que
// podem ser abertas a partir de qualquer aba.
export type RootStackParamList = {
  Abas: NavigatorScreenParams<AbasParamList> | undefined;
  Semana: { semanaId: string };
  TreinoDetalhe: { treino: TreinoPrevisto };
  TreinoTiro: { treinoId: string };
  CriarEditarCiclo: { cicloId?: string };
  HistoricoCiclos: undefined;
  RegistrarTreinoManual: { semanaId: string; treinoPrevistoId?: string };
  Configuracoes: undefined;
  AvaliarTreino: { treinoRealizadoId: string };
  ImportarPlanilha: undefined;
};
