// Base visual do app — única fonte de cores/tipografia/espaçamento.
// Paleta pensada pra corrida: azul principal (ação/progresso), verde
// (meta batida), laranja (atenção), vermelho (não realizado).

export const cores = {
  primaria: '#2563eb',
  primariaEscura: '#1d4ed8',
  primariaFundo: '#eff6ff',

  fundo: '#f8fafc',
  superficie: '#ffffff',

  texto: '#0f172a',
  textoSecundario: '#64748b',
  textoClaro: '#ffffff',

  borda: '#e2e8f0',

  sucesso: '#16a34a',
  sucessoFundo: '#f0fdf4',
  aviso: '#d97706',
  avisoFundo: '#fffbeb',
  erro: '#dc2626',
  erroFundo: '#fef2f2',
  neutro: '#94a3b8',
  neutroFundo: '#f1f5f9',
} as const;

// Cor + emoji por tipo de treino — dá pra escanear a semana visualmente
// sem ler a descrição inteira de cada linha.
export const tipoTreino = {
  rodagem: { cor: '#2563eb', fundo: '#eff6ff', emoji: '🏃' },
  qualidade: { cor: '#d97706', fundo: '#fffbeb', emoji: '⚡' },
  longo: { cor: '#7c3aed', fundo: '#f5f3ff', emoji: '🏔️' },
  descanso: { cor: '#64748b', fundo: '#f1f5f9', emoji: '😴' },
} as const;

export const espacamento = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const raio = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const tipografia = {
  titulo: { fontSize: 24, fontWeight: '700' as const, color: cores.texto },
  subtitulo: { fontSize: 17, fontWeight: '600' as const, color: cores.texto },
  corpo: { fontSize: 15, fontWeight: '400' as const, color: cores.texto },
  corpoForte: { fontSize: 15, fontWeight: '600' as const, color: cores.texto },
  legenda: { fontSize: 13, fontWeight: '400' as const, color: cores.textoSecundario },
  legendaForte: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: cores.textoSecundario,
  },
};
