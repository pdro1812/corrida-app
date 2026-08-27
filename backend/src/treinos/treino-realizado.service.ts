import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreinoRealizadoDto } from './dto/create-treino-realizado.dto';
import { RegistrarFeedbackDto } from './dto/registrar-feedback.dto';
import { VincularTreinoRealizadoDto } from './dto/vincular-treino-realizado.dto';

@Injectable()
export class TreinoRealizadoService {
  constructor(private readonly prisma: PrismaService) {}

  // RF16: registro manual de um treino realizado (quando não vem do Garmin).
  async create(dto: CreateTreinoRealizadoDto) {
    if (dto.treinoPrevistoId) {
      const previsto = await this.prisma.treinoPrevisto.findUnique({
        where: { id: dto.treinoPrevistoId },
      });
      if (!previsto) {
        throw new NotFoundException(
          `Treino previsto ${dto.treinoPrevistoId} não encontrado`,
        );
      }
    }

    const [criado] = await this.prisma.$transaction([
      this.prisma.treinoRealizado.create({
        data: {
          treinoPrevistoId: dto.treinoPrevistoId,
          fonte: 'manual',
          data: new Date(dto.data),
          distanciaKm: dto.distanciaKm,
          duracaoSegundos: dto.duracaoSegundos,
          paceMedio: dto.paceMedio,
          fcMedia: dto.fcMedia,
          fcMax: dto.fcMax,
          elevacaoM: dto.elevacaoM,
          rpe: dto.rpe,
          sensacoes: dto.sensacoes ?? [],
          feedbackTexto: dto.feedbackTexto,
          observacoes: dto.observacoes,
        },
      }),
      ...(dto.treinoPrevistoId
        ? [
            this.prisma.treinoPrevisto.update({
              where: { id: dto.treinoPrevistoId },
              data: { status: 'realizado' },
            }),
          ]
        : []),
    ]);

    return criado;
  }

  // Lista treinos realizados (por padrão, os sincronizados do Garmin) pra
  // a tela "Dados do Garmin" do app — mostra o que foi importado, casado
  // ou não com o previsto (RF12-RF15).
  findAll(fonte?: string) {
    return this.prisma.treinoRealizado.findMany({
      where: fonte ? { fonte } : undefined,
      orderBy: { data: 'desc' },
      include: { treinoPrevisto: true },
      relationLoadStrategy: 'join',
    });
  }

  async findOne(id: string) {
    const treino = await this.prisma.treinoRealizado.findUnique({
      where: { id },
      include: { intervalos: { orderBy: { ordem: 'asc' } } },
      relationLoadStrategy: 'join',
    });
    if (!treino) {
      throw new NotFoundException(`Treino realizado ${id} não encontrado`);
    }
    return treino;
  }

  // RF18: feedback estruturado — RPE, tags de sensação, texto livre.
  // Vale tanto para treinos manuais quanto sincronizados do Garmin (que
  // nunca trazem feedback subjetivo).
  async registrarFeedback(id: string, dto: RegistrarFeedbackDto) {
    await this.findOne(id);
    return this.prisma.treinoRealizado.update({
      where: { id },
      data: {
        rpe: dto.rpe,
        sensacoes: dto.sensacoes,
        feedbackTexto: dto.feedbackTexto,
      },
    });
  }

  // Corrige o casamento automático (RF15) quando ele erra: o matching por
  // data ±1 dia pode ligar o realizado a um previsto vizinho errado (ex:
  // treino adiantado/atrasado vários dias) ou deixar avulso um realizado
  // que na verdade corresponde a outro previsto. Aqui o dono liga/religa
  // manualmente. O previsto antigo só volta pra "pendente" se não sobrar
  // nenhum outro realizado vinculado a ele (um previsto pode ter mais de
  // um realizado, ver RF15).
  async vincular(id: string, dto: VincularTreinoRealizadoDto) {
    const treino = await this.prisma.treinoRealizado.findUnique({
      where: { id },
    });
    if (!treino) {
      throw new NotFoundException(`Treino realizado ${id} não encontrado`);
    }

    const novoTreinoPrevistoId = dto.treinoPrevistoId ?? null;
    const antigoTreinoPrevistoId = treino.treinoPrevistoId;

    if (novoTreinoPrevistoId) {
      const previsto = await this.prisma.treinoPrevisto.findUnique({
        where: { id: novoTreinoPrevistoId },
      });
      if (!previsto) {
        throw new NotFoundException(
          `Treino previsto ${novoTreinoPrevistoId} não encontrado`,
        );
      }
    }

    if (novoTreinoPrevistoId === antigoTreinoPrevistoId) {
      return treino;
    }

    await this.prisma.treinoRealizado.update({
      where: { id },
      data: { treinoPrevistoId: novoTreinoPrevistoId },
    });

    if (antigoTreinoPrevistoId) {
      const restantes = await this.prisma.treinoRealizado.count({
        where: { treinoPrevistoId: antigoTreinoPrevistoId },
      });
      if (restantes === 0) {
        await this.prisma.treinoPrevisto.update({
          where: { id: antigoTreinoPrevistoId },
          data: { status: 'pendente' },
        });
      }
    }

    if (novoTreinoPrevistoId) {
      await this.prisma.treinoPrevisto.update({
        where: { id: novoTreinoPrevistoId },
        data: { status: 'realizado' },
      });
    }

    return this.findOne(id);
  }

  // Remove um treino realizado errado/duplicado sem apagar o treino
  // previsto vinculado — ele volta pra "pendente" (o dono decide depois
  // se marca como não realizado ou registra de novo). Sem isso a única
  // forma de "desfazer" um registro era excluir o treino previsto inteiro.
  async remove(id: string) {
    const treino = await this.prisma.treinoRealizado.findUnique({
      where: { id },
    });
    if (!treino) {
      throw new NotFoundException(`Treino realizado ${id} não encontrado`);
    }

    await this.prisma.$transaction([
      this.prisma.treinoRealizado.delete({ where: { id } }),
      ...(treino.treinoPrevistoId
        ? [
            this.prisma.treinoPrevisto.update({
              where: { id: treino.treinoPrevistoId },
              data: { status: 'pendente' },
            }),
          ]
        : []),
    ]);
  }
}
