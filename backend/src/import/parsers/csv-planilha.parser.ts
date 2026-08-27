import { parse } from 'csv-parse/sync';

export interface LinhaPlanilha {
  semana: number;
  data: string;
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

export interface ResultadoParsePlanilha {
  linhas: LinhaPlanilha[];
  erros: LinhaComErro[];
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
];

function numeroOuUndefined(valor: string | undefined): number | undefined {
  if (!valor || valor.trim() === '') {
    return undefined;
  }
  const numero = Number(valor.replace(',', '.'));
  return Number.isNaN(numero) ? undefined : numero;
}

function textoOuUndefined(valor: string | undefined): string | undefined {
  return valor && valor.trim() !== '' ? valor.trim() : undefined;
}

// Formato "longo" de uma linha por treino, ver docs/ARCHITECTURE.md §4.
export function parsePlanilhaCsv(csv: string): ResultadoParsePlanilha {
  const registros: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const linhas: LinhaPlanilha[] = [];
  const erros: LinhaComErro[] = [];

  registros.forEach((registro, indice) => {
    const numeroLinha = indice + 2; // +1 cabeçalho, +1 index 1-based

    const faltando = COLUNAS_ESPERADAS.filter(
      (coluna) => !(coluna in registro),
    );
    if (faltando.length > 0) {
      erros.push({
        linha: numeroLinha,
        motivo: `Colunas ausentes: ${faltando.join(', ')}`,
      });
      return;
    }

    const semana = Number(registro.semana);
    if (!Number.isInteger(semana) || semana < 1) {
      erros.push({ linha: numeroLinha, motivo: 'Campo "semana" inválido' });
      return;
    }

    if (!registro.data || Number.isNaN(Date.parse(registro.data))) {
      erros.push({ linha: numeroLinha, motivo: 'Campo "data" inválido' });
      return;
    }

    if (!textoOuUndefined(registro.dia_semana)) {
      erros.push({
        linha: numeroLinha,
        motivo: 'Campo "dia_semana" obrigatório',
      });
      return;
    }

    if (!textoOuUndefined(registro.descricao)) {
      erros.push({
        linha: numeroLinha,
        motivo: 'Campo "descricao" obrigatório',
      });
      return;
    }

    linhas.push({
      semana,
      data: registro.data,
      diaSemana: registro.dia_semana,
      fase: textoOuUndefined(registro.fase),
      tipo: textoOuUndefined(registro.tipo),
      descricao: registro.descricao,
      distanciaAlvoKm: numeroOuUndefined(registro.distancia_alvo_km),
      paceAlvoMin: textoOuUndefined(registro.pace_alvo_min),
      paceAlvoMax: textoOuUndefined(registro.pace_alvo_max),
    });
  });

  return { linhas, erros };
}
