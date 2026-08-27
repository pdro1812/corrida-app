import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TreinosService } from './treinos.service';

describe('TreinosService', () => {
  let service: TreinosService;
  const prisma = {
    semana: {
      findUnique: jest.fn(),
    },
    treinoPrevisto: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    treinoPrevistoIntervalo: {
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TreinosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TreinosService);
  });

  it('finds treino_previsto candidates within a date window around the given date', async () => {
    prisma.treinoPrevisto.findMany.mockResolvedValue([]);

    await service.buscarCandidatosVinculo('2026-08-26', 7);

    expect(prisma.treinoPrevisto.findMany).toHaveBeenCalledWith({
      where: {
        data: { gte: new Date('2026-08-19'), lte: new Date('2026-09-02') },
      },
      orderBy: { data: 'asc' },
    });
  });

  it('throws NotFoundException when creating a treino for a missing semana', async () => {
    prisma.semana.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-semana', {
        diaSemana: 'terca',
        data: '2026-01-06',
        descricao: '45 min Leve',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.treinoPrevisto.create).not.toHaveBeenCalled();
  });

  it('creates a treino nesting intervalos when provided (RF08)', async () => {
    prisma.semana.findUnique.mockResolvedValue({ id: 'semana-1' });
    prisma.treinoPrevisto.create.mockResolvedValue({ id: 'treino-1' });

    const intervalos = [
      { ordem: 1, tipo: 'aquecimento' as const },
      { ordem: 2, tipo: 'tiro' as const, repeticaoNumero: 1 },
    ];

    await service.create('semana-1', {
      diaSemana: 'quinta',
      data: '2026-01-08',
      descricao: '6x 1km',
      intervalos,
    });

    expect(prisma.treinoPrevisto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          semanaId: 'semana-1',
          intervalos: { create: intervalos },
        }),
      }),
    );
  });

  it('replaces intervalos on update instead of accumulating them', async () => {
    prisma.treinoPrevisto.findUnique.mockResolvedValue({ id: 'treino-1' });
    prisma.treinoPrevisto.update.mockResolvedValue({ id: 'treino-1' });

    const novosIntervalos = [{ ordem: 1, tipo: 'aquecimento' as const }];

    await service.update('treino-1', { intervalos: novosIntervalos });

    expect(prisma.treinoPrevistoIntervalo.deleteMany).toHaveBeenCalledWith({
      where: { treinoPrevistoId: 'treino-1' },
    });
    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          intervalos: { create: novosIntervalos },
        }),
      }),
    );
  });

  it('marks a treino as nao_realizado with the given motivo (RF17)', async () => {
    prisma.treinoPrevisto.findUnique.mockResolvedValue({ id: 'treino-1' });
    prisma.treinoPrevisto.update.mockResolvedValue({
      id: 'treino-1',
      status: 'nao_realizado',
    });

    await service.marcarNaoRealizado('treino-1', {
      motivoNaoRealizado: 'Chuva forte',
    });

    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith({
      where: { id: 'treino-1' },
      data: { status: 'nao_realizado', motivoNaoRealizado: 'Chuva forte' },
    });
  });

  it('throws NotFoundException when treino does not exist', async () => {
    prisma.treinoPrevisto.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });
});
