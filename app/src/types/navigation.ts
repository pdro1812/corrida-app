import { TreinoPrevisto } from './api';

// Fluxo de navegação da aba Home — telas de detalhe/edição que partem
// do dashboard e do ciclo ativo.
export type HomeStackParamList = {
  Home: undefined;
  Semana: { semanaId: string };
  TreinoDetalhe: { treino: TreinoPrevisto };
  TreinoTiro: { treinoId: string };
  CriarEditarCiclo: { cicloId?: string };
  HistoricoCiclos: undefined;
  RegistrarTreinoManual: { semanaId: string; treinoPrevistoId?: string };
};

// Abas fixas na parte inferior (padrão "barra do Instagram"). Provas,
// Importar e Garmin não recebem cicloId por parâmetro — cada uma busca o
// ciclo ativo sozinha, já que são acessíveis diretamente pela barra.
export type RootTabParamList = {
  HomeTab: undefined;
  Treinos: undefined;
  Provas: undefined;
  Importar: undefined;
  Garmin: undefined;
};
