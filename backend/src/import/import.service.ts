import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LinhaComErro,
  LinhaPlanilha,
  parsePlanilhaCsv,
} from './parsers/csv-planilha.parser';
import { parseTreinoIntervalado } from './parsers/treino-intervalado.parser';
import { extrairDuracaoMinutosDaDescricao } from '../common/duracao-descricao.util';

export interface ResultadoImportacao {
  importacaoId: string;
  semanasCriadas: number;
  semanasReaproveitadas: number;
  treinosCriados: number;
  linhasComErro: LinhaComErro[];
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importarPlanilhaCsv(
    cicloId: string,
    csv: string,
    nomeArquivo?: string,
  ): Promise<ResultadoImportacao> {
    const ciclo = await this.prisma.ciclo.findUnique({
      where: { id: cicloId },
    });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo ${cicloId} não encontrado`);
    }

    const { linhas, erros } = parsePlanilhaCsv(csv);

    // Cria o registro da importação primeiro pra poder vincular cada
    // treino_previsto a ela (permite listar "últimas planilhas
    // importadas" e excluir a importação inteira de uma vez).
    const importacao = await this.prisma.importacao.create({
      data: {
        cicloId,
        nomeArquivo,
        semanasCriadas: 0,
        treinosCriados: 0,
        linhasComErro: erros.length,
      },
    });

    const porSemana = new Map<number, LinhaPlanilha[]>();
    for (const linha of linhas) {
      const grupo = porSemana.get(linha.semana) ?? [];
      grupo.push(linha);
      porSemana.set(linha.semana, grupo);
    }

    let semanasCriadas = 0;
    let semanasReaproveitadas = 0;
    let treinosCriados = 0;

    for (const [numeroSemana, linhasDaSemana] of porSemana) {
      const datas = linhasDaSemana.map((linha) => new Date(linha.data));
      const dataInicio = new Date(
        Math.min(...datas.map((data) => data.getTime())),
      );
      const dataFim = new Date(
        Math.max(...datas.map((data) => data.getTime())),
      );
      const fase = linhasDaSemana.find((linha) => linha.fase)?.fase;

      let semana = await this.prisma.semana.findFirst({
        where: { cicloId, numeroSemana },
      });

      if (semana) {
        semanasReaproveitadas++;
      } else {
        semana = await this.prisma.semana.create({
          data: { cicloId, numeroSemana, dataInicio, dataFim, fase },
        });
        semanasCriadas++;
      }

      for (const linha of linhasDaSemana) {
        const intervalos = parseTreinoIntervalado(linha.descricao);
        // Treinos sem distância alvo (ex: "45 min Leve") só têm a duração
        // no texto livre — extrai pra não ficar de fora do km planejado
        // total da semana/ciclo (RF20, ver semanas.service.ts).
        const duracaoAlvoMinutos =
          linha.distanciaAlvoKm === undefined
            ? extrairDuracaoMinutosDaDescricao(linha.descricao)
            : undefined;

        await this.prisma.treinoPrevisto.create({
          data: {
            semanaId: semana.id,
            importacaoId: importacao.id,
            diaSemana: linha.diaSemana,
            data: new Date(linha.data),
            tipo: linha.tipo,
            descricao: linha.descricao,
            distanciaAlvoKm: linha.distanciaAlvoKm,
            duracaoAlvoSegundos: duracaoAlvoMinutos
              ? duracaoAlvoMinutos * 60
              : undefined,
            paceAlvoMin: linha.paceAlvoMin,
            paceAlvoMax: linha.paceAlvoMax,
            intervalos: intervalos ? { create: intervalos } : undefined,
          },
        });
        treinosCriados++;
      }
    }

    await this.prisma.importacao.update({
      where: { id: importacao.id },
      data: { semanasCriadas, treinosCriados },
    });

    return {
      importacaoId: importacao.id,
      semanasCriadas,
      semanasReaproveitadas,
      treinosCriados,
      linhasComErro: erros,
    };
  }

  async listarPorCiclo(cicloId: string) {
    const ciclo = await this.prisma.ciclo.findUnique({
      where: { id: cicloId },
    });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo ${cicloId} não encontrado`);
    }
    return this.prisma.importacao.findMany({
      where: { cicloId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async remover(id: string) {
    const importacao = await this.prisma.importacao.findUnique({
      where: { id },
    });
    if (!importacao) {
      throw new NotFoundException(`Importação ${id} não encontrada`);
    }
    // Cascata apaga os treino_previsto (e seus intervalos) criados por
    // essa importação — a semana em si não é apagada, pode ter treinos
    // de outras importações ou ter sido reaproveitada.
    await this.prisma.importacao.delete({ where: { id } });
  }
}
