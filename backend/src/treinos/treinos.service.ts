import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreinoPrevistoDto } from './dto/create-treino-previsto.dto';
import { MarcarNaoRealizadoDto } from './dto/marcar-nao-realizado.dto';
import { UpdateTreinoPrevistoDto } from './dto/update-treino-previsto.dto';

@Injectable()
export class TreinosService {
  constructor(private readonly prisma: PrismaService) {}

  private async garantirSemanaExiste(semanaId: string) {
    const semana = await this.prisma.semana.findUnique({
      where: { id: semanaId },
    });
    if (!semana) {
      throw new NotFoundException(`Semana ${semanaId} não encontrada`);
    }
  }

  async create(semanaId: string, dto: CreateTreinoPrevistoDto) {
    await this.garantirSemanaExiste(semanaId);
    return this.prisma.treinoPrevisto.create({
      data: {
        semanaId,
        diaSemana: dto.diaSemana,
        data: new Date(dto.data),
        tipo: dto.tipo,
        descricao: dto.descricao,
        distanciaAlvoKm: dto.distanciaAlvoKm,
        duracaoAlvoSegundos: dto.duracaoAlvoSegundos,
        paceAlvoMin: dto.paceAlvoMin,
        paceAlvoMax: dto.paceAlvoMax,
        intervalos: dto.intervalos ? { create: dto.intervalos } : undefined,
      },
      include: { intervalos: true },
    });
  }

  async findAllBySemana(semanaId: string) {
    await this.garantirSemanaExiste(semanaId);
    return this.prisma.treinoPrevisto.findMany({
      where: { semanaId },
      include: { intervalos: { orderBy: { ordem: 'asc' } } },
      orderBy: { data: 'asc' },
    });
  }

  // Candidatos pra tela de editar vínculo (fix do RF15): treinos previstos
  // de qualquer semana/ciclo dentro de uma janela de dias em torno da data
  // do treino realizado, pra quando o casamento automático (±1 dia) erra
  // (ex: treino adiantado/atrasado vários dias na semana).
  async buscarCandidatosVinculo(dataIso: string, janelaDias: number) {
    const data = new Date(dataIso);
    const inicio = new Date(data);
    inicio.setDate(inicio.getDate() - janelaDias);
    const fim = new Date(data);
    fim.setDate(fim.getDate() + janelaDias);

    return this.prisma.treinoPrevisto.findMany({
      where: { data: { gte: inicio, lte: fim } },
      orderBy: { data: 'asc' },
    });
  }

  async findOne(id: string) {
    const treino = await this.prisma.treinoPrevisto.findUnique({
      where: { id },
      include: {
        intervalos: { orderBy: { ordem: 'asc' } },
        // Necessário pra Tela Detalhe do Treino de Tiro (RF22) comparar
        // intervalo previsto x realizado.
        realizados: {
          include: { intervalos: { orderBy: { ordem: 'asc' } } },
        },
      },
      relationLoadStrategy: 'join',
    });
    if (!treino) {
      throw new NotFoundException(`Treino previsto ${id} não encontrado`);
    }
    return treino;
  }

  async update(id: string, dto: UpdateTreinoPrevistoDto) {
    await this.findOne(id);

    if (dto.intervalos) {
      await this.prisma.treinoPrevistoIntervalo.deleteMany({
        where: { treinoPrevistoId: id },
      });
    }

    await this.prisma.treinoPrevisto.update({
      where: { id },
      data: {
        diaSemana: dto.diaSemana,
        data: dto.data ? new Date(dto.data) : undefined,
        tipo: dto.tipo,
        descricao: dto.descricao,
        distanciaAlvoKm: dto.distanciaAlvoKm,
        duracaoAlvoSegundos: dto.duracaoAlvoSegundos,
        paceAlvoMin: dto.paceAlvoMin,
        paceAlvoMax: dto.paceAlvoMax,
        intervalos: dto.intervalos ? { create: dto.intervalos } : undefined,
      },
    });
    return this.findOne(id);
  }

  async marcarNaoRealizado(id: string, dto: MarcarNaoRealizadoDto) {
    await this.findOne(id);
    return this.prisma.treinoPrevisto.update({
      where: { id },
      data: {
        status: 'nao_realizado',
        motivoNaoRealizado: dto.motivoNaoRealizado,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.treinoPrevisto.delete({ where: { id } });
  }
}
