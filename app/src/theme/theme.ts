// Base visual do app — única fonte de cores/tipografia/espaçamento.
// v2: tema escuro "painel de instrumentos": fundo quase preto azulado,
// ciano neon para ação/progresso, verde-lima para meta batida, âmbar para
// atenção e magenta/vermelho para esforço alto ou falha.

export const cores = {
  primaria: '#22d3ee',
  primariaEscura: '#0891b2',
  primariaFundo: '#0b2530',

  fundo: '#05070d',
  superficie: '#0d1320',
  superficieElevada: '#141c2e',

  texto: '#e6f0ff',
  textoSecundario: '#7f8ba3',
  textoClaro: '#04121a', // texto sobre a cor primária (neon claro)

  borda: '#1c2740',
  brilho: '#22d3ee',

  sucesso: '#a3e635',
  sucessoFundo: '#18240a',
  aviso: '#fbbf24',
  avisoFundo: '#2a1f06',
  erro: '#f43f5e',
  erroFundo: '#2b0a12',
  neutro: '#64748b',
  neutroFundo: '#121a2a',

  // Escala de esforço/custo (baixo -> alto) para gráficos e badges.
  esforco: ['#22d3ee', '#a3e635', '#fbbf24', '#fb7185', '#e879f9'],
} as const;

// Cor + emoji por tipo de treino — dá pra escanear a semana visualmente
// sem ler a descrição inteira de cada linha.
export const tipoTreino = {
  rodagem: { cor: '#22d3ee', fundo: '#0b2530', emoji: '🏃' },
  qualidade: { cor: '#fbbf24', fundo: '#2a1f06', emoji: '⚡' },
  longo: { cor: '#c084fc', fundo: '#1f1030', emoji: '🏔️' },
  descanso: { cor: '#7f8ba3', fundo: '#121a2a', emoji: '😴' },
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
  titulo: { fontSize: 24, fontWeight: '800' as const, color: cores.texto, letterSpacing: 0.5 },
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

// Número grande de painel (métricas em destaque).
export const numeroPainel = {
  fontSize: 32,
  fontWeight: '800' as const,
  color: cores.texto,
  fontVariant: ['tabular-nums' as const],
  letterSpacing: -0.5,
};
