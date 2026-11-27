// Blocos (mesociclos) de um ciclo de preparação: Base, Desenvolvimento,
// Específico, Polimento... Cada bloco é um intervalo de datas dentro do
// ciclo; as semanas entram no bloco pela data. Lógica pura, sem I/O.

export const TIPOS_BLOCO = ['pre_ciclo', 'base', 'desenvolvimento', 'especifico', 'polimento', 'transicao'] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];

export const ROTULO_TIPO_BLOCO: Record<TipoBloco, string> = {
  pre_ciclo: 'Pré-ciclo',
  base: 'Base',
  desenvolvimento: 'Desenvolvimento',
  especifico: 'Específico',
  polimento: 'Polimento (taper)',
  transicao: 'Transição',
};

export interface BlocoCicloNovo {
  nome: string;
  tipo: TipoBloco;
  dataInicio: string;
  dataFim: string;
  objetivo?: string | null;
}

const DIA = 86400000;
const diaUtc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function semanasEntre(inicio: string, fim: string): number {
  return Math.max(1, Math.round((diaUtc(fim) - diaUtc(inicio) + DIA) / (7 * DIA)));
}

// Divide o ciclo em Base / Desenvolvimento / Específico / Polimento, com o
// polimento nas últimas `semanasTaper` semanas e o resto na proporção
// 9:8:9 (a mesma da planilha de referência). O usuário ajusta depois.
export function gerarBlocosPadrao(dataInicio: string, dataFim: string, semanasTaper = 3): BlocoCicloNovo[] {
  const total = semanasEntre(dataInicio, dataFim);
  const taper = Math.min(semanasTaper, Math.max(1, Math.floor(total / 4)));
  const resto = total - taper;
  if (resto < 3) {
    return [
      { nome: 'Preparação', tipo: 'especifico', dataInicio, dataFim: isoDe(diaUtc(dataFim) - taper * 7 * DIA) },
      { nome: 'Polimento', tipo: 'polimento', dataInicio: isoDe(diaUtc(dataFim) - taper * 7 * DIA + DIA), dataFim },
    ].filter((b) => b.dataInicio <= b.dataFim) as BlocoCicloNovo[];
  }
  const base = Math.round((resto * 9) / 26);
  const desenvolvimento = Math.round((resto * 8) / 26);
  const especifico = resto - base - desenvolvimento;
  const partes: [string, TipoBloco, number][] = [
    ['Base', 'base', base],
    ['Desenvolvimento', 'desenvolvimento', desenvolvimento],
    ['Específico', 'especifico', especifico],
    ['Polimento', 'polimento', taper],
  ];
  const blocos: BlocoCicloNovo[] = [];
  let cursor = diaUtc(dataInicio);
  partes.forEach(([nome, tipo, semanas], i) => {
    const fim = i === partes.length - 1 ? diaUtc(dataFim) : cursor + semanas * 7 * DIA - DIA;
    blocos.push({ nome: `Bloco ${i + 1} - ${nome}`, tipo, dataInicio: isoDe(cursor), dataFim: isoDe(fim) });
    cursor = fim + DIA;
  });
  return blocos;
}

// Tipo provável a partir do texto livre da fase da planilha.
export function tipoDaFase(fase: string): TipoBloco {
  const f = fase.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/pre.?ciclo|adapta/.test(f)) return 'pre_ciclo';
  if (/taper|polimento|polim/.test(f)) return 'polimento';
  if (/especif/.test(f)) return 'especifico';
  if (/desenv|construc|build/.test(f)) return 'desenvolvimento';
  if (/transi|recupera|regenera/.test(f)) return 'transicao';
  return 'base';
}

// Agrupa semanas consecutivas com a mesma fase (texto da planilha) em blocos.
export function blocosDasFases(semanas: { dataInicio: string; dataFim: string; fase: string | null }[]): BlocoCicloNovo[] {
  const ordenadas = [...semanas].filter((s) => s.fase?.trim()).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  const blocos: BlocoCicloNovo[] = [];
  for (const s of ordenadas) {
    const fase = (s.fase ?? '').trim();
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.nome.toLowerCase() === fase.toLowerCase()) {
      ultimo.dataFim = s.dataFim.slice(0, 10);
    } else {
      blocos.push({ nome: fase, tipo: tipoDaFase(fase), dataInicio: s.dataInicio.slice(0, 10), dataFim: s.dataFim.slice(0, 10) });
    }
  }
  return blocos;
}

export function blocoDaData<T extends { dataInicio: string; dataFim: string }>(blocos: T[], data: string): T | null {
  const d = data.slice(0, 10);
  return blocos.find((b) => b.dataInicio <= d && d <= b.dataFim) ?? null;
}

// "semana 3 de 8" do bloco que contém a data.
export function posicaoNoBloco(bloco: { dataInicio: string; dataFim: string }, data: string) {
  const total = semanasEntre(bloco.dataInicio, bloco.dataFim);
  const atual = Math.min(total, Math.floor((diaUtc(data) - diaUtc(bloco.dataInicio)) / (7 * DIA)) + 1);
  return { atual, total };
}

export function validarBloco(b: BlocoCicloNovo): string | null {
  if (!b.nome.trim()) return 'Informe o nome do bloco';
  if (!TIPOS_BLOCO.includes(b.tipo)) return 'Tipo de bloco inválido';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(b.dataFim)) return 'Datas no formato AAAA-MM-DD';
  if (Number.isNaN(diaUtc(b.dataInicio)) || Number.isNaN(diaUtc(b.dataFim))) return 'Data inválida';
  if (b.dataFim < b.dataInicio) return 'O fim do bloco é antes do início';
  return null;
}
