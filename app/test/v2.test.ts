import { Encoder, FileIdMesg, Profile, RecordMesg, SessionMesg } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { calcularCustoEsforco, indiceCustoRelativo } from '../src/dominio/custoEsforco';
import { AmostraFit, calcularDesacoplamento, extrairMetricasDoFit } from '../src/dominio/metricasFit';

// FIT sintético gerado com o Encoder do próprio SDK — sem dados reais.
function fitSintetico(sessao: SessionMesg, records: RecordMesg[]): Uint8Array {
  const inicio = new Date('2026-11-01T07:00:00Z');
  const encoder = new Encoder();
  const fileId: FileIdMesg = { manufacturer: 'development', product: 1, timeCreated: inicio, type: 'activity' };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
  for (const record of records) encoder.onMesg(Profile.MesgNum.RECORD, record);
  encoder.onMesg(Profile.MesgNum.SESSION, { timestamp: inicio, startTime: inicio, sport: 'running', ...sessao });
  return encoder.close();
}

// 40 min a 3 m/s; FC de 140 na 1ª metade útil e `fcFinal` na 2ª.
function amostrasConstantes(fcFinal: number): AmostraFit[] {
  return Array.from({ length: 2400 }, (_, i) => ({ segundos: i, velocidade: 3, fc: i < 1500 ? 140 : fcFinal }));
}

describe('metricasFit', () => {
  it('lê o resumo da sessão e converte unidades', () => {
    const inicio = new Date('2026-11-01T07:00:00Z');
    const records: RecordMesg[] = Array.from({ length: 900 }, (_, i) => ({
      timestamp: new Date(inicio.getTime() + i * 1000),
      heartRate: 150,
      enhancedSpeed: 3,
    }));
    const fit = fitSintetico(
      {
        startPositionLat: Math.round((-29.68 * 2 ** 31) / 180),
        startPositionLong: Math.round((-53.81 * 2 ** 31) / 180),
        avgCadence: 85,
        avgPower: 250,
        avgStepLength: 1150,
        totalCalories: 600,
        totalTrainingEffect: 3.2,
        totalDescent: 40,
      },
      records,
    );
    const metricas = extrairMetricasDoFit(fit);
    expect(metricas.horaInicio).toBe('2026-11-01T07:00:00.000Z');
    expect(metricas.latitudeInicio).toBeCloseTo(-29.68, 3);
    expect(metricas.longitudeInicio).toBeCloseTo(-53.81, 3);
    expect(metricas.cadenciaMediaPpm).toBe(170); // 85 passadas/min = 170 passos/min
    expect(metricas.potenciaMediaW).toBe(250);
    expect(metricas.comprimentoPassadaM).toBe(1.15);
    expect(metricas.efeitoTreinoAerobico).toBe(3.2);
    expect(metricas.descidaM).toBe(40);
    expect(metricas.desacoplamentoPct).toBe(0); // FC e ritmo constantes após o aquecimento
  });

  it('calcula a deriva cardíaca entre as metades do treino', () => {
    expect(calcularDesacoplamento(amostrasConstantes(140))).toBe(0);
    // FC sobe de 140 para 147 no mesmo ritmo: ~4.8% de desacoplamento
    expect(calcularDesacoplamento(amostrasConstantes(147))).toBeCloseTo(4.8, 0);
    expect(calcularDesacoplamento(amostrasConstantes(147).slice(0, 650))).toBeNull(); // curto demais
  });
});

describe('custoEsforco', () => {
  const base = {
    distanciaKm: 10,
    duracaoSegundos: 3000,
    fcMedia: 150,
    elevacaoM: 0,
    rpe: 5,
    desacoplamentoPct: null,
    temperaturaC: 15,
  };

  it('calcula batimentos por km, eficiência e carga sRPE', () => {
    expect(calcularCustoEsforco(base)).toEqual({
      batimentosPorKm: 750, // 150 bpm x 50 min / 10 km
      fatorEficiencia: 1.333, // 200 m/min / 150
      cargaSessao: 250, // RPE 5 x 50 min
      batimentosPorKmAjustado: 750,
    });
  });

  it('desconta calor e subida no custo ajustado', () => {
    expect(calcularCustoEsforco({ ...base, temperaturaC: 25 }).batimentosPorKmAjustado).toBe(682); // 750 / 1.10
    expect(calcularCustoEsforco({ ...base, elevacaoM: 200 }).batimentosPorKmAjustado).toBe(735); // 750 / 1.02
  });

  it('não inventa valores sem dados', () => {
    expect(calcularCustoEsforco({ ...base, fcMedia: null, rpe: null })).toEqual({
      batimentosPorKm: null,
      fatorEficiencia: null,
      cargaSessao: null,
      batimentosPorKmAjustado: null,
    });
  });

  it('compara com a mediana do histórico', () => {
    expect(indiceCustoRelativo(825, [750, 760, 740, 2000])).toBe(109);
    expect(indiceCustoRelativo(825, [750, null])).toBeNull(); // poucos treinos
  });
});
