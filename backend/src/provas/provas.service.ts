import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProvaDto } from './dto/create-prova.dto';
import { RegistrarResultadoProvaDto } from './dto/registrar-resultado-prova.dto';

@Injectable()
export class ProvasService {
  constructor(private readonly prisma: PrismaService) {}

  private async garantirCicloExiste(cicloId: string) {
    const ciclo = await this.prisma.ciclo.findUnique({
      where: { id: cicloId },
    });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo ${cicloId} não encontrado`);
    }
  }

  // A prova alvo é criada junto com o ciclo (CiclosService.create) —
  // aqui só cabe criar secundárias, exceto se o ciclo ficou sem alvo
  // por algum motivo (não deveria acontecer no fluxo normal).
  async create(cicloId: string, dto: CreateProvaDto) {
    await this.garantirCicloExiste(cicloId);
    const tipo = dto.tipo ?? 'secundaria';
    if (tipo === 'alvo') {
      const jaTemAlvo = await this.prisma.prova.findFirst({
        where: { cicloId, tipo: 'alvo' },
      });
      if (jaTemAlvo) {
        throw new ConflictException(
          'Este ciclo já tem uma prova alvo — edite-a na tela de edição do ciclo.',
        );
      }
    }
    return this.prisma.prova.create({
      data: {
        cicloId,
        nome: dto.nome,
        data: new Date(dto.data),
        tipo,
        distanciaKm: dto.distanciaKm,
        metaTempoSegundos: dto.metaTempoSegundos,
      },
    });
  }

  async findAllByCiclo(cicloId: string) {
    await this.garantirCicloExiste(cicloId);
    return this.prisma.prova.findMany({
      where: { cicloId },
      orderBy: { data: 'asc' },
    });
  }

  private async findOne(id: string) {
    const prova = await this.prisma.prova.findUnique({ where: { id } });
    if (!prova) {
      throw new NotFoundException(`Prova ${id} não encontrada`);
    }
    return prova;
  }

  async registrarResultado(id: string, dto: RegistrarResultadoProvaDto) {
    await this.findOne(id);
    return this.prisma.prova.update({
      where: { id },
      data: {
        resultadoTempoSegundos: dto.resultadoTempoSegundos,
        resultadoPace: dto.resultadoPace,
        concluida: true,
      },
    });
  }

  async remove(id: string) {
    const prova = await this.findOne(id);
    if (prova.tipo === 'alvo') {
      throw new BadRequestException(
        'Não é possível excluir a prova alvo do ciclo — edite-a na tela de edição do ciclo.',
      );
    }
    await this.prisma.prova.delete({ where: { id } });
  }
}
