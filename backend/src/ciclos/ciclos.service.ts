import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCicloDto } from './dto/create-ciclo.dto';
import { UpdateCicloDto } from './dto/update-ciclo.dto';

@Injectable()
export class CiclosService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCicloDto) {
    return this.prisma.ciclo.create({
      data: {
        nome: dto.nome,
        dataInicio: new Date(dto.dataInicio),
        dataFim: new Date(dto.dataFim),
        provas: {
          create: {
            tipo: 'alvo',
            nome: dto.provaNome,
            data: new Date(dto.provaData),
            distanciaKm: dto.provaDistanciaKm,
            metaTempoSegundos: dto.provaMetaTempoSegundos,
          },
        },
      },
      include: { provas: true },
    });
  }

  findAll(status?: string) {
    return this.prisma.ciclo.findMany({
      where: status ? { status } : undefined,
      orderBy: { dataInicio: 'desc' },
      include: { provas: true },
      relationLoadStrategy: 'join',
    });
  }

  async findOne(id: string) {
    const ciclo = await this.prisma.ciclo.findUnique({
      where: { id },
      include: { provas: true },
      relationLoadStrategy: 'join',
    });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo ${id} não encontrado`);
    }
    return ciclo;
  }

  async update(id: string, dto: UpdateCicloDto) {
    await this.findOne(id);

    const temCamposProva =
      dto.provaNome !== undefined ||
      dto.provaData !== undefined ||
      dto.provaDistanciaKm !== undefined ||
      dto.provaMetaTempoSegundos !== undefined;

    return this.prisma.$transaction(async (tx) => {
      if (temCamposProva) {
        const provaAlvo = await tx.prova.findFirst({
          where: { cicloId: id, tipo: 'alvo' },
        });
        if (provaAlvo) {
          await tx.prova.update({
            where: { id: provaAlvo.id },
            data: {
              nome: dto.provaNome,
              data: dto.provaData ? new Date(dto.provaData) : undefined,
              distanciaKm: dto.provaDistanciaKm,
              metaTempoSegundos: dto.provaMetaTempoSegundos,
            },
          });
        }
      }

      return tx.ciclo.update({
        where: { id },
        data: {
          nome: dto.nome,
          dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : undefined,
          dataFim: dto.dataFim ? new Date(dto.dataFim) : undefined,
          status: dto.status,
        },
        include: { provas: true },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.ciclo.delete({ where: { id } });
  }
}
