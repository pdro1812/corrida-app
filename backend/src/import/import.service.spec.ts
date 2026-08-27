import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ImportService } from './import.service';

const CSV = `semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
1,2026-07-07,terca,1. Base,rodagem,45 min Leve,,5:15,5:30
1,2026-07-09,quinta,1. Base,qualidade,"2km Leve + 6x 1km (90s trote) + 1km Leve",,4:15,4:20
1,2026-07-12,domingo,1. Base,longo,13km Leve,13,5:10,5:25`;

describe('ImportService', () => {
  let service: ImportService;
  const prisma = {
    ciclo: { findUnique: jest.fn() },
    semana: { findFirst: jest.fn(), create: jest.fn() },
    treinoPrevisto: { create: jest.fn() },
    importacao: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.importacao.create.mockResolvedValue({ id: 'importacao-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ImportService);
  });

  it('throws NotFoundException when ciclo does not exist', async () => {
    prisma.ciclo.findUnique.mockResolvedValue(null);

    await expect(
      service.importarPlanilhaCsv('missing-ciclo', CSV),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates one semana and all treinos, structuring the intervalado one', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: 'ciclo-1' });
    prisma.semana.findFirst.mockResolvedValue(null);
    prisma.semana.create.mockResolvedValue({ id: 'semana-1' });
    prisma.treinoPrevisto.create.mockResolvedValue({ id: 'treino-x' });

    const resultado = await service.importarPlanilhaCsv('ciclo-1', CSV);

    expect(prisma.semana.create).toHaveBeenCalledTimes(1);
    expect(prisma.semana.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cicloId: 'ciclo-1',
          numeroSemana: 1,
          dataInicio: new Date('2026-07-07'),
          dataFim: new Date('2026-07-12'),
          fase: '1. Base',
        }),
      }),
    );

    expect(prisma.treinoPrevisto.create).toHaveBeenCalledTimes(3);
    const chamadaIntervalada = prisma.treinoPrevisto.create.mock.calls.find(
      ([args]) => args.data.diaSemana === 'quinta',
    );
    expect(chamadaIntervalada[0].data.intervalos.create).toHaveLength(14);

    expect(resultado).toEqual({
      importacaoId: 'importacao-1',
      semanasCriadas: 1,
      semanasReaproveitadas: 0,
      treinosCriados: 3,
      linhasComErro: [],
    });
    expect(prisma.treinoPrevisto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ importacaoId: 'importacao-1' }),
      }),
    );
    expect(prisma.importacao.update).toHaveBeenCalledWith({
      where: { id: 'importacao-1' },
      data: { semanasCriadas: 1, treinosCriados: 3 },
    });
  });

  it('reuses an existing semana instead of duplicating it', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: 'ciclo-1' });
    prisma.semana.findFirst.mockResolvedValue({ id: 'semana-existente' });
    prisma.treinoPrevisto.create.mockResolvedValue({ id: 'treino-x' });

    const resultado = await service.importarPlanilhaCsv('ciclo-1', CSV);

    expect(prisma.semana.create).not.toHaveBeenCalled();
    expect(resultado.semanasReaproveitadas).toBe(1);
    expect(resultado.semanasCriadas).toBe(0);
  });

  it('reports rows with errors without failing the whole import', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: 'ciclo-1' });
    prisma.semana.findFirst.mockResolvedValue({ id: 'semana-1' });
    prisma.treinoPrevisto.create.mockResolvedValue({ id: 'treino-x' });

    const csvComErro = `semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
1,2026-07-07,terca,,rodagem,45 min Leve,,5:15,5:30
abc,2026-07-09,quinta,,longo,13km Leve,13,5:10,5:25`;

    const resultado = await service.importarPlanilhaCsv('ciclo-1', csvComErro);

    expect(resultado.treinosCriados).toBe(1);
    expect(resultado.linhasComErro).toHaveLength(1);
  });

  it('lists importações for a ciclo ordered by most recent', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: 'ciclo-1' });
    prisma.importacao.findMany.mockResolvedValue([]);

    await service.listarPorCiclo('ciclo-1');

    expect(prisma.importacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cicloId: 'ciclo-1' },
        orderBy: { criadoEm: 'desc' },
      }),
    );
  });

  it('throws NotFoundException listing importações for a missing ciclo', async () => {
    prisma.ciclo.findUnique.mockResolvedValue(null);

    await expect(service.listarPorCiclo('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removes an importação (cascades to its treinos via FK)', async () => {
    prisma.importacao.findUnique.mockResolvedValue({ id: 'importacao-1' });

    await service.remover('importacao-1');

    expect(prisma.importacao.delete).toHaveBeenCalledWith({
      where: { id: 'importacao-1' },
    });
  });

  it('throws NotFoundException removing a missing importação', async () => {
    prisma.importacao.findUnique.mockResolvedValue(null);

    await expect(service.remover('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.importacao.delete).not.toHaveBeenCalled();
  });
});
