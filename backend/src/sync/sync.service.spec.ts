import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { GarminIndisponivelError } from '../garmin/garmin.errors';
import { GarminService } from '../garmin/garmin.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

// Evita agendar um timer real (job.start()) durante os testes, o que
// deixaria o processo do Jest pendurado esperando o próximo disparo.
jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation(() => ({ start: jest.fn() })),
}));

const ATIVIDADE_CORRIDA_SIMPLES = {
  activityId: 111,
  activityType: { typeKey: 'street_running' },
  startTimeLocal: '2026-08-19T06:05:37.0',
  distance: 5000,
  duration: 1500,
  averageSpeed: 5000 / 1500,
  averageHR: 140,
  maxHR: 160,
  elevationGain: 20,
  lapCount: 1,
};

const ATIVIDADE_CORRIDA_INTERVALADA = {
  ...ATIVIDADE_CORRIDA_SIMPLES,
  activityId: 222,
  lapCount: 3,
};

const ATIVIDADE_CICLISMO = {
  activityId: 333,
  activityType: { typeKey: 'cycling' },
  lapCount: 1,
};

describe('SyncService', () => {
  let service: SyncService;
  const garminService = {
    buscarAtividadesRecentes: jest.fn(),
    buscarSplitsDaAtividade: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const schedulerRegistry = { addCronJob: jest.fn() };
  const prisma = {
    treinoRealizado: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    treinoPrevisto: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((operacoes: unknown[]) => Promise.all(operacoes)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Por padrão nenhum treino pendente de matching — os testes de
    // matching sobrescrevem isso explicitamente.
    prisma.treinoRealizado.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((operacoes: unknown[]) =>
      Promise.all(operacoes),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: GarminService, useValue: garminService },
        { provide: ConfigService, useValue: configService },
        { provide: SchedulerRegistry, useValue: schedulerRegistry },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SyncService);
  });

  it('registers the cron job using GARMIN_SYNC_CRON on init', () => {
    configService.get.mockReturnValue('0 6 * * *');

    service.onModuleInit();

    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'garmin-sync',
      expect.anything(),
    );
    expect(configService.get).toHaveBeenCalledWith('GARMIN_SYNC_CRON');
  });

  it('ignores non-running activities', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([
      ATIVIDADE_CICLISMO,
    ]);

    const resultado = await service.sincronizarGarmin();

    expect(prisma.treinoRealizado.create).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({
      atividadesEncontradas: 1,
      atividadesImportadas: 0,
    });
  });

  it('skips activities already imported (RF14 idempotency)', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([
      ATIVIDADE_CORRIDA_SIMPLES,
    ]);
    prisma.treinoRealizado.findUnique.mockResolvedValue({ id: 'ja-existe' });

    const resultado = await service.sincronizarGarmin();

    expect(prisma.treinoRealizado.create).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({
      atividadesImportadas: 0,
      atividadesJaExistentes: 1,
    });
  });

  it('imports a new running activity without fetching splits when lapCount is 1', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([
      ATIVIDADE_CORRIDA_SIMPLES,
    ]);
    prisma.treinoRealizado.findUnique.mockResolvedValue(null);
    prisma.treinoRealizado.create.mockResolvedValue({ id: 'novo' });

    const resultado = await service.sincronizarGarmin();

    expect(garminService.buscarSplitsDaAtividade).not.toHaveBeenCalled();
    expect(prisma.treinoRealizado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          garminActivityId: '111',
          intervalos: undefined,
        }),
      }),
    );
    expect(resultado.atividadesImportadas).toBe(1);
  });

  it('fetches and nests splits when lapCount > 1', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([
      ATIVIDADE_CORRIDA_INTERVALADA,
    ]);
    prisma.treinoRealizado.findUnique.mockResolvedValue(null);
    prisma.treinoRealizado.create.mockResolvedValue({ id: 'novo' });
    garminService.buscarSplitsDaAtividade.mockResolvedValue([
      { lapIndex: 1, intensityType: 'ACTIVE', distance: 1000, duration: 240 },
    ]);

    await service.sincronizarGarmin();

    expect(garminService.buscarSplitsDaAtividade).toHaveBeenCalledWith(222);
    expect(prisma.treinoRealizado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          intervalos: { create: expect.any(Array) },
        }),
      }),
    );
  });

  it('matches a pending treino_realizado with a treino_previsto within ±1 day (RF15)', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([]);
    prisma.treinoRealizado.findMany.mockResolvedValue([
      { id: 'realizado-1', data: new Date('2026-08-19') },
    ]);
    prisma.treinoPrevisto.findMany.mockResolvedValue([
      { id: 'previsto-1', data: new Date('2026-08-19') },
    ]);

    const resultado = await service.sincronizarGarmin();

    expect(prisma.treinoRealizado.update).toHaveBeenCalledWith({
      where: { id: 'realizado-1' },
      data: { treinoPrevistoId: 'previsto-1' },
    });
    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith({
      where: { id: 'previsto-1' },
      data: { status: 'realizado' },
    });
    expect(resultado.treinosCasadosComPrevisto).toBe(1);
  });

  it('does not match when there is no treino_previsto candidate', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([]);
    prisma.treinoRealizado.findMany.mockResolvedValue([
      { id: 'realizado-1', data: new Date('2026-08-19') },
    ]);
    prisma.treinoPrevisto.findMany.mockResolvedValue([]);

    const resultado = await service.sincronizarGarmin();

    expect(prisma.treinoRealizado.update).not.toHaveBeenCalled();
    expect(resultado.treinosCasadosComPrevisto).toBe(0);
  });

  it('picks the closest date when more than one candidate is within range', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([]);
    prisma.treinoRealizado.findMany.mockResolvedValue([
      { id: 'realizado-1', data: new Date('2026-08-19') },
    ]);
    prisma.treinoPrevisto.findMany.mockResolvedValue([
      { id: 'previsto-longe', data: new Date('2026-08-18') },
      { id: 'previsto-perto', data: new Date('2026-08-19') },
    ]);

    await service.sincronizarGarmin();

    expect(prisma.treinoRealizado.update).toHaveBeenCalledWith({
      where: { id: 'realizado-1' },
      data: { treinoPrevistoId: 'previsto-perto' },
    });
  });

  it('links a second treino_realizado to a treino_previsto that already has one (Garmin split the workout in two activities)', async () => {
    garminService.buscarAtividadesRecentes.mockResolvedValue([]);
    prisma.treinoRealizado.findMany.mockResolvedValue([
      { id: 'realizado-2', data: new Date('2026-08-19') },
    ]);
    prisma.treinoPrevisto.findMany.mockResolvedValue([
      { id: 'previsto-1', data: new Date('2026-08-19') },
    ]);

    const resultado = await service.sincronizarGarmin();

    expect(prisma.treinoPrevisto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ realizados: expect.anything() }),
      }),
    );
    expect(prisma.treinoRealizado.update).toHaveBeenCalledWith({
      where: { id: 'realizado-2' },
      data: { treinoPrevistoId: 'previsto-1' },
    });
    expect(resultado.treinosCasadosComPrevisto).toBe(1);
  });

  it('never throws when Garmin is unavailable (RNF12) — returns ok:false instead', async () => {
    garminService.buscarAtividadesRecentes.mockRejectedValue(
      new GarminIndisponivelError(new Error('timeout')),
    );

    const resultado = await service.sincronizarGarmin();

    expect(resultado.ok).toBe(false);
    expect(resultado.atividadesEncontradas).toBe(0);
    expect(resultado.erro).toBeDefined();
  });
});
