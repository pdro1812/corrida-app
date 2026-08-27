import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CiclosService } from './ciclos.service';

describe('CiclosService', () => {
  let service: CiclosService;
  const prisma = {
    ciclo: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CiclosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CiclosService);
  });

  it('creates a ciclo converting date strings to Date and nesting a prova alvo', async () => {
    prisma.ciclo.create.mockResolvedValue({ id: '1' });

    await service.create({
      nome: 'Meia Maratona',
      dataInicio: '2026-01-01',
      dataFim: '2026-06-01',
      provaNome: 'Meia de Porto Alegre',
      provaData: '2026-06-01',
    });

    expect(prisma.ciclo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nome: 'Meia Maratona',
          dataInicio: new Date('2026-01-01'),
          dataFim: new Date('2026-06-01'),
          provas: {
            create: expect.objectContaining({
              tipo: 'alvo',
              nome: 'Meia de Porto Alegre',
              data: new Date('2026-06-01'),
            }),
          },
        }),
      }),
    );
  });

  it('filters findAll by status when provided', async () => {
    prisma.ciclo.findMany.mockResolvedValue([]);

    await service.findAll('concluido');

    expect(prisma.ciclo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'concluido' } }),
    );
  });

  it('throws NotFoundException when ciclo does not exist', async () => {
    prisma.ciclo.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing ciclo', async () => {
    prisma.ciclo.findUnique.mockResolvedValue({ id: '1' });
    prisma.ciclo.delete.mockResolvedValue({ id: '1' });

    await service.remove('1');

    expect(prisma.ciclo.delete).toHaveBeenCalledWith({ where: { id: '1' } });
  });
});
