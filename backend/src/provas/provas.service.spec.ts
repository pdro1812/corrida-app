import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProvasService } from './provas.service';

describe('ProvasService', () => {
  let service: ProvasService;
  const prisma = {
    ciclo: {
      findUnique: jest.fn(),
    },
    prova: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProvasService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ProvasService);
  });

  it('throws NotFoundException when creating a prova for a missing ciclo', async () => {
    prisma.ciclo.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-ciclo', {
        nome: 'Prova teste',
        data: '2026-05-01',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.prova.create).not.toHaveBeenCalled();
  });

  it('creates a prova defaulting tipo to secundaria', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: 'ciclo-1' });
    prisma.prova.create.mockResolvedValue({ id: 'prova-1' });

    await service.create('ciclo-1', {
      nome: 'Prova teste',
      data: '2026-05-01',
    });

    expect(prisma.prova.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cicloId: 'ciclo-1',
          tipo: 'secundaria',
        }),
      }),
    );
  });

  it('throws ConflictException when creating a second prova alvo for the same ciclo', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: 'ciclo-1' });
    prisma.prova.findFirst.mockResolvedValue({
      id: 'prova-existente',
      tipo: 'alvo',
    });

    await expect(
      service.create('ciclo-1', {
        nome: 'Outra alvo',
        data: '2026-05-01',
        tipo: 'alvo',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.prova.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when trying to delete the prova alvo', async () => {
    prisma.prova.findUnique.mockResolvedValue({ id: 'prova-1', tipo: 'alvo' });

    await expect(service.remove('prova-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.prova.delete).not.toHaveBeenCalled();
  });

  it('registers a resultado and marks prova as concluida', async () => {
    prisma.prova.findUnique.mockResolvedValue({ id: 'prova-1' });
    prisma.prova.update.mockResolvedValue({ id: 'prova-1', concluida: true });

    await service.registrarResultado('prova-1', {
      resultadoTempoSegundos: 5400,
      resultadoPace: '4:15',
    });

    expect(prisma.prova.update).toHaveBeenCalledWith({
      where: { id: 'prova-1' },
      data: {
        resultadoTempoSegundos: 5400,
        resultadoPace: '4:15',
        concluida: true,
      },
    });
  });

  it('throws NotFoundException when registering resultado for missing prova', async () => {
    prisma.prova.findUnique.mockResolvedValue(null);

    await expect(
      service.registrarResultado('missing', { resultadoTempoSegundos: 100 }),
    ).rejects.toThrow(NotFoundException);
  });
});
