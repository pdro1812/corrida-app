import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { of } from 'rxjs';
import { DecimalInterceptor } from './decimal.interceptor';

describe('DecimalInterceptor', () => {
  const interceptor = new DecimalInterceptor();

  function executar(data: unknown): Promise<unknown> {
    const handler: CallHandler = { handle: () => of(data) };
    return new Promise((resolve) => {
      interceptor
        .intercept({} as ExecutionContext, handler)
        .subscribe((resultado) => resolve(resultado));
    });
  }

  it('converts a top-level Decimal to number', async () => {
    const resultado = await executar(new Prisma.Decimal('8.1'));
    expect(resultado).toBe(8.1);
  });

  it('converts Decimal fields nested in objects and arrays', async () => {
    const resultado = await executar({
      nome: 'Semana 1',
      kmPlanejadoTotal: 15.5,
      treinos: [
        { distanciaAlvoKm: new Prisma.Decimal('8'), tipo: 'rodagem' },
        { distanciaAlvoKm: null, tipo: 'descanso' },
      ],
    });

    expect(resultado).toEqual({
      nome: 'Semana 1',
      kmPlanejadoTotal: 15.5,
      treinos: [
        { distanciaAlvoKm: 8, tipo: 'rodagem' },
        { distanciaAlvoKm: null, tipo: 'descanso' },
      ],
    });
  });

  it('leaves dates untouched instead of walking into them', async () => {
    const data = new Date('2026-08-20');
    const resultado = await executar({ criadoEm: data });
    expect((resultado as { criadoEm: Date }).criadoEm).toBe(data);
  });
});
