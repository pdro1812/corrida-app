import {
  ehAtividadeDeCorrida,
  formatarPace,
  mapearAtividadeParaTreinoRealizado,
  mapearSplitsParaIntervalos,
} from './garmin-activity.mapper';

describe('ehAtividadeDeCorrida', () => {
  it('accepts activities with a running typeKey', () => {
    expect(
      ehAtividadeDeCorrida({
        activityType: { typeKey: 'street_running' },
      } as any),
    ).toBe(true);
    expect(
      ehAtividadeDeCorrida({
        activityType: { typeKey: 'trail_running' },
      } as any),
    ).toBe(true);
  });

  it('rejects non-running activities', () => {
    expect(
      ehAtividadeDeCorrida({ activityType: { typeKey: 'cycling' } } as any),
    ).toBe(false);
  });
});

describe('formatarPace', () => {
  it('converts m/s to min:sec per km', () => {
    // 1000m / (1000/240) m/s = 240s = 4:00 min/km
    expect(formatarPace(1000 / 240)).toBe('4:00');
  });

  it('pads seconds below 10', () => {
    // 1000m em 245s -> 4:05 min/km
    expect(formatarPace(1000 / 245)).toBe('4:05');
  });

  it('returns undefined for missing or zero speed', () => {
    expect(formatarPace(undefined)).toBeUndefined();
    expect(formatarPace(0)).toBeUndefined();
  });
});

describe('mapearAtividadeParaTreinoRealizado', () => {
  it('maps garmin fields to treino_realizado fields', () => {
    const resultado = mapearAtividadeParaTreinoRealizado({
      activityId: 123,
      startTimeLocal: '2026-08-19T06:05:37.0',
      distance: 10500,
      duration: 2700.4,
      averageSpeed: 10500 / 2700,
      averageHR: 145.6,
      maxHR: 170,
      elevationGain: 55,
    } as any);

    expect(resultado.garminActivityId).toBe('123');
    expect(resultado.fonte).toBe('garmin');
    expect(resultado.data).toEqual(new Date('2026-08-19'));
    expect(resultado.distanciaKm).toBe(10.5);
    expect(resultado.duracaoSegundos).toBe(2700);
    expect(resultado.fcMedia).toBe(146);
    expect(resultado.fcMax).toBe(170);
    expect(resultado.elevacaoM).toBe(55);
  });
});

describe('mapearSplitsParaIntervalos', () => {
  it('maps Garmin intensityType to warmup/run/recovery/cooldown and numbers repetitions', () => {
    const laps = [
      { lapIndex: 1, intensityType: 'WARMUP', distance: 2000, duration: 600 },
      { lapIndex: 2, intensityType: 'ACTIVE', distance: 1000, duration: 240 },
      { lapIndex: 3, intensityType: 'REST', duration: 90 },
      { lapIndex: 4, intensityType: 'ACTIVE', distance: 1000, duration: 235 },
      { lapIndex: 5, intensityType: 'REST', duration: 90 },
      {
        lapIndex: 6,
        intensityType: 'COOLDOWN',
        distance: 1000,
        duration: 400,
      },
    ];

    const resultado = mapearSplitsParaIntervalos(laps);

    expect(resultado).toHaveLength(6);
    expect(resultado[0]).toMatchObject({
      tipo: 'warmup',
      repeticaoNumero: null,
    });
    expect(resultado[1]).toMatchObject({ tipo: 'run', repeticaoNumero: 1 });
    expect(resultado[2]).toMatchObject({
      tipo: 'recovery',
      repeticaoNumero: 1,
    });
    expect(resultado[3]).toMatchObject({ tipo: 'run', repeticaoNumero: 2 });
    expect(resultado[4]).toMatchObject({
      tipo: 'recovery',
      repeticaoNumero: 2,
    });
    expect(resultado[5]).toMatchObject({
      tipo: 'cooldown',
      repeticaoNumero: null,
    });
  });

  it('defaults to run for unknown intensityType values', () => {
    const resultado = mapearSplitsParaIntervalos([
      { lapIndex: 1, intensityType: undefined, distance: 1000, duration: 300 },
    ]);

    expect(resultado[0].tipo).toBe('run');
  });
});
