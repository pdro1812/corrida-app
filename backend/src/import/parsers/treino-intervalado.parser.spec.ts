import { parseTreinoIntervalado } from './treino-intervalado.parser';

describe('parseTreinoIntervalado', () => {
  it('returns null when there is no repetition block', () => {
    expect(parseTreinoIntervalado('45 min Leve')).toBeNull();
    expect(parseTreinoIntervalado('13km Leve')).toBeNull();
  });

  it('structures aquecimento + tiros/recuperações + desaquecimento', () => {
    const resultado = parseTreinoIntervalado(
      '2km Leve + 6x 1km (90s trote) + 1km Leve',
    );

    expect(resultado).not.toBeNull();
    // 1 aquecimento + 6 tiros + 6 recuperações + 1 desaquecimento
    expect(resultado).toHaveLength(14);

    expect(resultado?.[0]).toMatchObject({
      ordem: 1,
      tipo: 'aquecimento',
      distanciaAlvoKm: 2,
    });

    expect(resultado?.[1]).toMatchObject({
      ordem: 2,
      tipo: 'tiro',
      repeticaoNumero: 1,
      distanciaAlvoKm: 1,
    });
    expect(resultado?.[2]).toMatchObject({
      ordem: 3,
      tipo: 'recuperacao',
      repeticaoNumero: 1,
      duracaoAlvoSegundos: 90,
    });

    expect(resultado?.[11]).toMatchObject({
      ordem: 12,
      tipo: 'tiro',
      repeticaoNumero: 6,
      distanciaAlvoKm: 1,
    });
    expect(resultado?.[13]).toMatchObject({
      ordem: 14,
      tipo: 'desaquecimento',
      distanciaAlvoKm: 1,
    });
  });

  it('handles a repetition block without warmup/cooldown segments', () => {
    const resultado = parseTreinoIntervalado('4x 400m (60s trote)');
    expect(resultado).toHaveLength(8);
    expect(resultado?.[0]).toMatchObject({
      tipo: 'tiro',
      distanciaAlvoKm: 0.4,
    });
    expect(resultado?.[1]).toMatchObject({
      tipo: 'recuperacao',
      duracaoAlvoSegundos: 60,
    });
  });

  it('parses distances in meters and recovery in minutes (ex: "10x 400m (1min trote)")', () => {
    const resultado = parseTreinoIntervalado(
      '2km Leve + 10x 400m (1min trote) + 1km Leve',
    );

    expect(resultado).not.toBeNull();
    expect(resultado?.[0]).toMatchObject({
      tipo: 'aquecimento',
      distanciaAlvoKm: 2,
    });
    expect(resultado?.[1]).toMatchObject({
      tipo: 'tiro',
      repeticaoNumero: 1,
      distanciaAlvoKm: 0.4,
    });
    expect(resultado?.[2]).toMatchObject({
      tipo: 'recuperacao',
      repeticaoNumero: 1,
      duracaoAlvoSegundos: 60,
    });
    expect(resultado?.at(-1)).toMatchObject({
      tipo: 'desaquecimento',
      distanciaAlvoKm: 1,
    });
  });

  it('parses decimal distances using comma or dot', () => {
    const resultado = parseTreinoIntervalado('1x 1,5km (45s trote)');
    expect(resultado?.[0]).toMatchObject({
      tipo: 'tiro',
      distanciaAlvoKm: 1.5,
    });
  });
});
