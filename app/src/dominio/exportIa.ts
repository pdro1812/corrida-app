// v2: forma resumida de um treino usada pela tela Lab (custo de esforço e
// prontidão). O export para a IA é montado em dominio/exportGrafo.ts.

export interface IntervaloParaExport {
  tipo: string;
  distanciaKm: number | null;
  tempoSegundos: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
}

export interface TreinoParaExport {
  data: string;
  tipoPrevisto: string | null;
  descricaoPrevista: string | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
  distanciaKm: number | null;
  duracaoSegundos: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
  fcMax: number | null;
  elevacaoM: number | null;
  rpe: number | null;
  sensacoes: string[];
  feedbackTexto: string | null;
  cadenciaPpm: number | null;
  potenciaW: number | null;
  efeitoAerobico: number | null;
  efeitoAnaerobico: number | null;
  desacoplamentoPct: number | null;
  temperaturaC: number | null;
  sensacaoTermicaC: number | null;
  umidadePct: number | null;
  ventoKmh: number | null;
  codigoTempo: number | null;
  intervalos: IntervaloParaExport[];
}
