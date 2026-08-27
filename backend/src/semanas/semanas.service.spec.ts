import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SemanasService } from './semanas.service';

describe('SemanasService', () => {
  let service: SemanasService;
  const prisma = {
    ciclo: {
      findUnique: jest.fn(),
    },
    semana: {
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
      providers: [SemanasService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SemanasService);
  });

  it('throws NotFoundException when creating a semana for a missing ciclo', async () => {
    prisma.ciclo.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-ciclo', {
        numeroSemana: 1,
        dataInicio: '2026-01-05',
        dataFim: '2026-01-11',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.semana.create).not.toHaveBeenCalled();
  });

  it('computes km/tempo total from treinos previstos, never stores them', async () => {
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      cicloId: 'ciclo-1',
      numeroSemana: 1,
      dataInicio: new Date('2026-01-05'),
      dataFim: new Date('2026-01-11'),
      fase: null,
      rotinaExtra: null,
      treinosPrevistos: [
        { distanciaAlvoKm: '10', duracaoAlvoSegundos: 3000, intervalos: [] },
        { distanciaAlvoKm: '5.5', duracaoAlvoSegundos: 1800, intervalos: [] },
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: null,
          paceAlvoMin: null,
          paceAlvoMax: null,
          descricao: 'Descanso',
          intervalos: [],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    expect(semana.kmPlanejadoTotal).toBe(15.5);
    expect(semana.tempoPlanejadoTotalSegundos).toBe(4800);
    expect(semana).not.toHaveProperty('km_planejado_total');
  });

  it('estimates km from duração + pace when a treino has no distância alvo (ex: "45 min Leve")', async () => {
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      treinosPrevistos: [
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: 2700, // 45 min
          paceAlvoMin: '5:15',
          paceAlvoMax: '5:30',
          descricao: '45 min Leve',
          intervalos: [],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    // pace médio 5:22.5/km (322.5s) -> 2700 / 322.5 ≈ 8.37 km
    expect(semana.kmPlanejadoTotal).toBeCloseTo(8.372, 2);
  });

  it('estimates km from intervalos when a treino intervalado tem no distância alvo total', async () => {
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      treinosPrevistos: [
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: null,
          paceAlvoMin: null,
          paceAlvoMax: null,
          intervalos: [
            { distanciaAlvoKm: '2', tipo: 'aquecimento' },
            { distanciaAlvoKm: '1', tipo: 'tiro' },
            { distanciaAlvoKm: null, tipo: 'recuperacao' },
            { distanciaAlvoKm: '1', tipo: 'desaquecimento' },
          ],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    expect(semana.kmPlanejadoTotal).toBe(4);
  });

  it('estimates km using a default 5:30/km pace when the treino has no pace alvo at all', async () => {
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      treinosPrevistos: [
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: 2700, // 45 min
          paceAlvoMin: null,
          paceAlvoMax: null,
          descricao: '45 min Leve',
          intervalos: [],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    // 2700s / 330s(5:30/km) = 8.18 km
    expect(semana.kmPlanejadoTotal).toBeCloseTo(8.1818, 3);
  });

  it('estimates trote/recuperação distance at the default 5:30/km pace', async () => {
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      treinosPrevistos: [
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: null,
          descricao: '2km Leve + 10x 400m (60s trote) + 1km Leve',
          intervalos: [
            { distanciaAlvoKm: '2', duracaoAlvoSegundos: null },
            ...Array.from({ length: 10 }, () => [
              { distanciaAlvoKm: '0.4', duracaoAlvoSegundos: null },
              { distanciaAlvoKm: null, duracaoAlvoSegundos: 60 },
            ]).flat(),
            { distanciaAlvoKm: '1', duracaoAlvoSegundos: null },
          ],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    // aquecimento 2 + 10 tiros de 0.4 (4) + 10 trotes de 60s/330s/km (~1.818) + desaquecimento 1
    expect(semana.kmPlanejadoTotal).toBeCloseTo(2 + 4 + 10 * (60 / 330) + 1, 3);
  });

  it('sums plain distance segments from the descrição when there is no repetição block', async () => {
    // regressão do bug relatado: "2km Leve + 6km Ritmo Prova + 1km Leve"
    // não tem "Nx" (sem repetição), então não vira treino_previsto_intervalo
    // — o total tem que somar os trechos de km mesmo assim.
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      treinosPrevistos: [
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: null,
          descricao: '2km Leve + 6km Ritmo Prova + 1km Leve',
          intervalos: [],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    expect(semana.kmPlanejadoTotal).toBe(9);
  });

  it('recognizes a repetição block live from the descrição when no treino_previsto_intervalo was persisted', async () => {
    // regressão: treinos importados antes do parser aceitar metros/minutos
    // ficaram sem intervalos gravados — o total tem que reconhecer isso
    // ao vivo, sem precisar reimportar a planilha.
    prisma.semana.findUnique.mockResolvedValue({
      id: 'semana-1',
      treinosPrevistos: [
        {
          distanciaAlvoKm: null,
          duracaoAlvoSegundos: null,
          paceAlvoMin: '4:30',
          paceAlvoMax: '4:30',
          descricao: '2km Leve + 3x 4km (2min trote) + 1km Leve',
          intervalos: [],
        },
      ],
    });

    const semana = await service.findOne('semana-1');

    // aquecimento 2 + 3 tiros de 4km (12) + 3 trotes de 120s/330s/km (~1.09) + desaquecimento 1
    expect(semana.kmPlanejadoTotal).toBeCloseTo(
      2 + 12 + 3 * (120 / 330) + 1,
      3,
    );
  });

  it('throws NotFoundException when semana does not exist', async () => {
    prisma.semana.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });
});
