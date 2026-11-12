// Planilha de treinos no formato "longo" (uma linha por treino), ver
// docs/ARCHITECTURE.md §4 e docs/exemplo-plano-treino.csv.

export interface LinhaPlanilha {
  semana: number;
  data: string; // YYYY-MM-DD
  diaSemana: string;
  fase?: string;
  tipo?: string;
  descricao: string;
  distanciaAlvoKm?: number;
  paceAlvoMin?: string;
  paceAlvoMax?: string;
}

export interface LinhaComErro {
  linha: number;
  motivo: string;
}

const COLUNAS_ESPERADAS = [
  'semana',
  'data',
  'dia_semana',
  'fase',
  'tipo',
  'descricao',
  'distancia_alvo_km',
  'pace_alvo_min',
  'pace_alvo_max',
] as const;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// CSV RFC 4180: vírgula como separador, aspas duplas para campos com
// vírgula/quebra de linha e "" como aspas escapadas. Ignora BOM e linhas
// totalmente vazias.
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let entreAspas = false;
  const conteudo = texto.replace(/^﻿/, '');

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (entreAspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ',') {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((valor) => valor.trim() !== ''));
}

function texto(valor: string | undefined): string | undefined {
  const limpo = valor?.trim();
  return limpo ? limpo : undefined;
}

function numero(valor: string | undefined): number | undefined {
  const limpo = texto(valor);
  if (!limpo) return undefined;
  const n = Number(limpo.replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
}

export function parsePlanilhaCsv(csv: string): { linhas: LinhaPlanilha[]; erros: LinhaComErro[] } {
  const [cabecalho, ...registros] = lerCsv(csv);
  const linhas: LinhaPlanilha[] = [];
  const erros: LinhaComErro[] = [];
  if (!cabecalho) return { linhas, erros: [{ linha: 1, motivo: 'Arquivo vazio' }] };

  const colunas = cabecalho.map((coluna) => coluna.trim());
  const faltando = COLUNAS_ESPERADAS.filter((coluna) => !colunas.includes(coluna));
  if (faltando.length > 0) {
    return { linhas, erros: [{ linha: 1, motivo: `Colunas ausentes: ${faltando.join(', ')}` }] };
  }

  registros.forEach((valores, indice) => {
    const numeroLinha = indice + 2; // +1 cabeçalho, +1 base 1
    const r = Object.fromEntries(colunas.map((coluna, i) => [coluna, valores[i]?.trim() ?? '']));

    const semana = Number(r.semana);
    if (!Number.isInteger(semana) || semana < 1) {
      erros.push({ linha: numeroLinha, motivo: 'Campo "semana" inválido' });
      return;
    }
    if (!DATA_ISO.test(r.data) || Number.isNaN(Date.parse(r.data))) {
      erros.push({ linha: numeroLinha, motivo: 'Campo "data" inválido (use AAAA-MM-DD)' });
      return;
    }
    if (!texto(r.dia_semana)) {
      erros.push({ linha: numeroLinha, motivo: 'Campo "dia_semana" obrigatório' });
      return;
    }
    if (!texto(r.descricao)) {
      erros.push({ linha: numeroLinha, motivo: 'Campo "descricao" obrigatório' });
      return;
    }

    linhas.push({
      semana,
      data: r.data,
      diaSemana: r.dia_semana,
      fase: texto(r.fase),
      tipo: texto(r.tipo),
      descricao: r.descricao,
      distanciaAlvoKm: numero(r.distancia_alvo_km),
      paceAlvoMin: texto(r.pace_alvo_min),
      paceAlvoMax: texto(r.pace_alvo_max),
    });
  });

  return { linhas, erros };
}
