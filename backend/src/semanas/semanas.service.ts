import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSemanaDto } from './dto/create-semana.dto';
import { UpdateSemanaDto } from './dto/update-semana.dto';
import {
  paceMedioSegundosPorKm,
  PACE_PADRAO_SEGUNDOS_POR_KM,
} from '../common/pace.util';
import { somarDistanciasDaDescricao } from '../common/descricao-treino.util';
import { extrairDuracaoMinutosDaDescricao } from '../common/duracao-descricao.util';
import { parseTreinoIntervalado } from '../import/parsers/treino-intervalado.parser';

const INCLUDE_TREINOS_PREVISTOS = {
  treinosPrevistos: {
    include: {
      realizados: true,
      // Necessário pra Tela Semana saber se há tiros estruturados e
      // linkar pra Tela Detalhe do Treino de Tiro (RF22).
      intervalos: { orderBy: { ordem: 'asc' } },
    },
  },
} satisfies Prisma.SemanaInclude;

type SemanaComTreinos = Prisma.SemanaGetPayload<{
  include: typeof INCLUDE_TREINOS_PREVISTOS;
}>;

@Injectable()
export class SemanasService {
  constructor(private readonly prisma: PrismaService) {}

  private async garantirCicloExiste(cicloId: string) {
    const ciclo = await this.prisma.ciclo.findUnique({
      where: { id: cicloId },
    });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo ${cicloId} não encontrado`);
    }
  }

  // Estima o km de um treino previsto quando ele não tem distância alvo
  // explícita — comum em treinos descritos só por tempo (ex: "45 min
  // Leve") ou treinos intervalados sem distância total no cabeçalho.
  // Sem isso o km planejado do ciclo (RF20) fica sistematicamente
  // subestimado, ignorando qualquer treino que não seja "por km".
  // Duração alvo do treino em segundos — usa a coluna se ela já veio
  // preenchida (import mais recente ou registro manual), senão tenta
  // extrair da descrição em tempo real (ex: "45 min Leve"). Isso é o que
  // permite treinos importados ANTES dessa extração existir (coluna ainda
  // null no banco) entrarem no total sem precisar reimportar a planilha.
  private duracaoAlvoSegundos(
    treino: SemanaComTreinos['treinosPrevistos'][number],
  ): number {
    if (treino.duracaoAlvoSegundos) {
      return treino.duracaoAlvoSegundos;
    }
    const minutos = extrairDuracaoMinutosDaDescricao(treino.descricao);
    return minutos ? minutos * 60 : 0;
  }

  // Soma a distância de uma lista de intervalos (tiro/aquecimento/
  // desaquecimento por distância direta, trote/recuperação estimado no
  // pace padrão) — usada tanto pros intervalos já gravados quanto pros
  // reconhecidos ao vivo em estimarKm (ver abaixo).
  private somarIntervalos(
    intervalos: {
      distanciaAlvoKm?: number | Prisma.Decimal | null;
      duracaoAlvoSegundos?: number | null;
    }[],
  ): number {
    return intervalos.reduce((soma, intervalo) => {
      if (intervalo.distanciaAlvoKm) {
        return soma + Number(intervalo.distanciaAlvoKm);
      }
      // Trote/recuperação nunca tem pace próprio na planilha — estima
      // sempre no pace padrão (decisão do dono do projeto).
      if (intervalo.duracaoAlvoSegundos) {
        return (
          soma + intervalo.duracaoAlvoSegundos / PACE_PADRAO_SEGUNDOS_POR_KM
        );
      }
      return soma;
    }, 0);
  }

  private estimarKm(
    treino: SemanaComTreinos['treinosPrevistos'][number],
  ): number {
    if (treino.distanciaAlvoKm) {
      return Number(treino.distanciaAlvoKm);
    }

    if (treino.intervalos.length > 0) {
      return this.somarIntervalos(treino.intervalos);
    }

    // Treinos importados antes do parser reconhecer o formato da
    // descrição (ex: metros/minutos) não têm treino_previsto_intervalo
    // gravado — tenta reconhecer ao vivo só pra estimar, sem persistir
    // nada (evita depender de reimportar a planilha pra corrigir o total).
    const intervalosDaDescricao = parseTreinoIntervalado(treino.descricao);
    if (intervalosDaDescricao) {
      return this.somarIntervalos(intervalosDaDescricao);
    }

    // Descrições com trechos de distância sem bloco de repetição
    // (ex: "2km Leve + 6km Ritmo Prova + 1km Leve").
    const distanciaDaDescricao = somarDistanciasDaDescricao(treino.descricao);
    if (distanciaDaDescricao > 0) {
      return distanciaDaDescricao;
    }

    // Treino só por tempo (ex: "45 min Leve") — estima pelo pace alvo,
    // ou pace padrão quando a planilha não informou nenhum.
    const duracaoSegundos = this.duracaoAlvoSegundos(treino);
    if (duracaoSegundos) {
      const paceSegundos =
        paceMedioSegundosPorKm(treino.paceAlvoMin, treino.paceAlvoMax) ??
        PACE_PADRAO_SEGUNDOS_POR_KM;
      return duracaoSegundos / paceSegundos;
    }

    return 0;
  }

  // Totais são derivados dos treinos previstos vinculados, nunca
  // armazenados (ver nota de implementação em docs/DATA_MODEL.md).
  private comTotais(semana: SemanaComTreinos) {
    const { treinosPrevistos, ...resto } = semana;
    const kmPlanejadoTotal = treinosPrevistos.reduce(
      (soma, treino) => soma + this.estimarKm(treino),
      0,
    );
    const tempoPlanejadoTotalSegundos = treinosPrevistos.reduce(
      (soma, treino) => soma + this.duracaoAlvoSegundos(treino),
      0,
    );

    return {
      ...resto,
      treinosPrevistos,
      kmPlanejadoTotal,
      tempoPlanejadoTotalSegundos,
    };
  }

  async create(cicloId: string, dto: CreateSemanaDto) {
    await this.garantirCicloExiste(cicloId);
    return this.prisma.semana.create({
      data: {
        cicloId,
        numeroSemana: dto.numeroSemana,
        dataInicio: new Date(dto.dataInicio),
        dataFim: new Date(dto.dataFim),
        fase: dto.fase,
        rotinaExtra: dto.rotinaExtra,
      },
    });
  }

  async findAllByCiclo(cicloId: string) {
    await this.garantirCicloExiste(cicloId);
    const semanas = await this.prisma.semana.findMany({
      where: { cicloId },
      include: INCLUDE_TREINOS_PREVISTOS,
      orderBy: { numeroSemana: 'asc' },
      relationLoadStrategy: 'join',
    });
    return semanas.map((semana) => this.comTotais(semana));
  }

  async findOne(id: string) {
    const semana = await this.prisma.semana.findUnique({
      where: { id },
      include: INCLUDE_TREINOS_PREVISTOS,
      relationLoadStrategy: 'join',
    });
    if (!semana) {
      throw new NotFoundException(`Semana ${id} não encontrada`);
    }
    return this.comTotais(semana);
  }

  private async garantirSemanaExiste(id: string) {
    const semana = await this.prisma.semana.findUnique({ where: { id } });
    if (!semana) {
      throw new NotFoundException(`Semana ${id} não encontrada`);
    }
  }

  async update(id: string, dto: UpdateSemanaDto) {
    await this.garantirSemanaExiste(id);
    await this.prisma.semana.update({
      where: { id },
      data: {
        numeroSemana: dto.numeroSemana,
        dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : undefined,
        dataFim: dto.dataFim ? new Date(dto.dataFim) : undefined,
        fase: dto.fase,
        rotinaExtra: dto.rotinaExtra,
      },
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.garantirSemanaExiste(id);
    await this.prisma.semana.delete({ where: { id } });
  }
}
