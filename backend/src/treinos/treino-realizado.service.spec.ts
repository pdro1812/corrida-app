import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TreinoRealizadoService } from './treino-realizado.service';

describe('TreinoRealizadoService', () => {
  let service: TreinoRealizadoService;
  const prisma = {
    treinoPrevisto: { findUnique: jest.fn(), update: jest.fn() },
    treinoRealizado: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((operacoes: unknown[]) => Promise.all(operacoes)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((operacoes: unknown[]) =>
      Promise.all(operacoes),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreinoRealizadoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TreinoRealizadoService);
  });

  it('creates a manual treino_realizado with fonte "manual"', async () => {
    prisma.treinoRealizado.create.mockResolvedValue({ id: 'novo' });

    await service.create({ data: '2026-08-20', distanciaKm: 10 });

    expect(prisma.treinoRealizado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fonte: 'manual', distanciaKm: 10 }),
      }),
    );
    expect(prisma.treinoPrevisto.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when treinoPrevistoId does not exist', async () => {
    prisma.treinoPrevisto.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ data: '2026-08-20', treinoPrevistoId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.treinoRealizado.create).not.toHaveBeenCalled();
  });

  it('links to treinoPrevisto and marks it realizado when provided', async () => {
    prisma.treinoPrevisto.findUnique.mockResolvedValue({ id: 'previsto-1' });
    prisma.treinoRealizado.create.mockResolvedValue({ id: 'novo' });

    await service.create({
      data: '2026-08-20',
      treinoPrevistoId: 'previsto-1',
    });

    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith({
      where: { id: 'previsto-1' },
      data: { status: 'realizado' },
    });
  });

  it('lists all treinos realizados filtering by fonte when provided', async () => {
    prisma.treinoRealizado.findMany.mockResolvedValue([]);

    await service.findAll('garmin');

    expect(prisma.treinoRealizado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fonte: 'garmin' } }),
    );
  });

  it('lists all treinos realizados without filtering when fonte is omitted', async () => {
    prisma.treinoRealizado.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prisma.treinoRealizado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('registers structured feedback — RPE, tags, texto (RF18)', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({ id: 'treino-1' });
    prisma.treinoRealizado.update.mockResolvedValue({ id: 'treino-1' });

    await service.registrarFeedback('treino-1', {
      rpe: 8,
      sensacoes: ['cansado', 'clima_ruim'],
      feedbackTexto: 'Difícil por causa do calor',
    });

    expect(prisma.treinoRealizado.update).toHaveBeenCalledWith({
      where: { id: 'treino-1' },
      data: {
        rpe: 8,
        sensacoes: ['cansado', 'clima_ruim'],
        feedbackTexto: 'Difícil por causa do calor',
      },
    });
  });

  it('throws NotFoundException when registering feedback for a missing treino', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue(null);

    await expect(
      service.registrarFeedback('missing', { rpe: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('re-links a treino_realizado to a different treino_previsto (RF15 fix)', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({
      id: 'realizado-1',
      treinoPrevistoId: 'previsto-antigo',
    });
    prisma.treinoPrevisto.findUnique.mockResolvedValue({ id: 'previsto-novo' });
    prisma.treinoRealizado.count.mockResolvedValue(0);
    prisma.treinoRealizado.update.mockResolvedValue({ id: 'realizado-1' });

    await service.vincular('realizado-1', {
      treinoPrevistoId: 'previsto-novo',
    });

    expect(prisma.treinoRealizado.update).toHaveBeenCalledWith({
      where: { id: 'realizado-1' },
      data: { treinoPrevistoId: 'previsto-novo' },
    });
    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith({
      where: { id: 'previsto-antigo' },
      data: { status: 'pendente' },
    });
    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith({
      where: { id: 'previsto-novo' },
      data: { status: 'realizado' },
    });
  });

  it('does not revert the old treino_previsto to pendente when another realizado is still linked to it', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({
      id: 'realizado-1',
      treinoPrevistoId: 'previsto-antigo',
    });
    prisma.treinoPrevisto.findUnique.mockResolvedValue({ id: 'previsto-novo' });
    prisma.treinoRealizado.count.mockResolvedValue(1);
    prisma.treinoRealizado.update.mockResolvedValue({ id: 'realizado-1' });

    await service.vincular('realizado-1', {
      treinoPrevistoId: 'previsto-novo',
    });

    expect(prisma.treinoPrevisto.update).not.toHaveBeenCalledWith({
      where: { id: 'previsto-antigo' },
      data: { status: 'pendente' },
    });
  });

  it('unlinks a treino_realizado (treinoPrevistoId null) and reverts the old previsto to pendente', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({
      id: 'realizado-1',
      treinoPrevistoId: 'previsto-antigo',
    });
    prisma.treinoRealizado.count.mockResolvedValue(0);
    prisma.treinoRealizado.update.mockResolvedValue({ id: 'realizado-1' });

    await service.vincular('realizado-1', { treinoPrevistoId: null });

    expect(prisma.treinoRealizado.update).toHaveBeenCalledWith({
      where: { id: 'realizado-1' },
      data: { treinoPrevistoId: null },
    });
    expect(prisma.treinoPrevisto.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when re-linking to a missing treino_previsto', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({
      id: 'realizado-1',
      treinoPrevistoId: null,
    });
    prisma.treinoPrevisto.findUnique.mockResolvedValue(null);

    await expect(
      service.vincular('realizado-1', { treinoPrevistoId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.treinoRealizado.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException re-linking a missing treino_realizado', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue(null);

    await expect(
      service.vincular('missing', { treinoPrevistoId: 'previsto-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('removes a treino_realizado and reverts the linked treino_previsto to pendente', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({
      id: 'realizado-1',
      treinoPrevistoId: 'previsto-1',
    });

    await service.remove('realizado-1');

    expect(prisma.treinoRealizado.delete).toHaveBeenCalledWith({
      where: { id: 'realizado-1' },
    });
    expect(prisma.treinoPrevisto.update).toHaveBeenCalledWith({
      where: { id: 'previsto-1' },
      data: { status: 'pendente' },
    });
  });

  it('removes an avulso treino_realizado (no treinoPrevistoId) without touching treino_previsto', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue({
      id: 'realizado-1',
      treinoPrevistoId: null,
    });

    await service.remove('realizado-1');

    expect(prisma.treinoRealizado.delete).toHaveBeenCalledWith({
      where: { id: 'realizado-1' },
    });
    expect(prisma.treinoPrevisto.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException removing a missing treino_realizado', async () => {
    prisma.treinoRealizado.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.treinoRealizado.delete).not.toHaveBeenCalled();
  });
});
