// Lista inicial de tags de sensação — ponto de partida, não travada como
// enum no banco (ver docs/DATA_MODEL.md). Fácil de estender aqui sem
// precisar de migration.
export const SENSACOES_DISPONIVEIS = [
  'bem_encaixado',
  'cansado',
  'dor',
  'animado',
  'clima_ruim',
  'teve_que_parar',
  'sub_performou',
  'superou_expectativa',
] as const;

const ROTULOS: Record<string, string> = {
  bem_encaixado: 'Bem encaixado',
  cansado: 'Cansado',
  dor: 'Dor',
  animado: 'Animado',
  clima_ruim: 'Clima ruim',
  teve_que_parar: 'Teve que parar',
  sub_performou: 'Sub-performou',
  superou_expectativa: 'Superou expectativa',
};

export function rotuloSensacao(sensacao: string): string {
  return ROTULOS[sensacao] ?? sensacao;
}
