import { Encoder, FileIdMesg, LapMesg, Profile } from '@garmin/fitsdk';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  ehAtividadeDeCorrida,
  extrairLapsDoFit,
  extrairLapsDoZip,
  mapearAtividade,
  mapearLapsParaIntervalos,
} from '../src/dominio/garmin';
import { lerCsv, parsePlanilhaCsv } from '../src/dominio/planilhaCsv';
import {
  estimarKm,
  extrairDuracaoMinutosDaDescricao,
  formatarPace,
  parseTreinoIntervalado,
  somarDistanciasDaDescricao,
} from '../src/dominio/textoTreino';

const treino = (parcial: Partial<Parameters<typeof estimarKm>[0]>) => ({
  descricao: '',
  distanciaAlvoKm: null,
  duracaoAlvoSegundos: null,
  paceAlvoMin: null,
  paceAlvoMax: null,
  ...parcial,
});

describe('textoTreino', () => {
  it('formata pace a partir de m/s, com zero à esquerda e sem estourar 60', () => {
    expect(formatarPace(1000 / 300)).toBe('5:00');
    expect(formatarPace(1000 / 305)).toBe('5:05');
    expect(formatarPace(1000 / 239.99999999999997)).toBe('4:00');
    expect(formatarPace(0)).toBeUndefined();
  });

  it('extrai duração de descrições por tempo', () => {
    expect(extrairDuracaoMinutosDaDescricao('45 min Leve')).toBe(45);
    expect(extrairDuracaoMinutosDaDescricao('1h30 Leve')).toBe(90);
    expect(extrairDuracaoMinutosDaDescricao('8 km fácil')).toBeUndefined();
  });

  it('soma trechos de distância sem bloco de repetição', () => {
    expect(somarDistanciasDaDescricao('2km Leve + 6km Ritmo Prova + 1km Leve')).toBe(9);
  });

  it('estrutura aquecimento, tiros, trotes e desaquecimento (RF08)', () => {
    const intervalos = parseTreinoIntervalado('2km Leve + 10x 400m (1min trote) + 1km Leve');
    expect(intervalos?.[0]).toEqual({ ordem: 1, tipo: 'aquecimento', distanciaAlvoKm: 2 });
    expect(intervalos?.filter((i) => i.tipo === 'tiro')).toHaveLength(10);
    expect(intervalos?.[2]).toEqual({ ordem: 3, tipo: 'recuperacao', repeticaoNumero: 1, duracaoAlvoSegundos: 60 });
    expect(intervalos?.at(-1)).toMatchObject({ tipo: 'desaquecimento', distanciaAlvoKm: 1 });
    expect(parseTreinoIntervalado('3 km aq + 20 min contínuo (4:20 a 4:25) + 3 km volta')).toBeNull();
  });

  it('estima km do treino previsto em cada caso (RF20)', () => {
    expect(estimarKm(treino({ distanciaAlvoKm: 12 }))).toBe(12);
    // 45 min na média 5:00-5:30 (315 s/km)
    expect(estimarKm(treino({ descricao: '45 min Leve', paceAlvoMin: '5:00', paceAlvoMax: '5:30' }))).toBeCloseTo(
      2700 / 315,
    );
    // sem pace: 5:30/km padrão
    expect(estimarKm(treino({ descricao: '55 min Leve' }))).toBeCloseTo(3300 / 330);
    // 2 + 6x1 + 6x90s trote a 5:30 + 1
    expect(estimarKm(treino({ descricao: '2km Leve + 6x 1km (90s trote) + 1km Leve' }))).toBeCloseTo(
      9 + (6 * 90) / 330,
    );
  });
});

describe('planilhaCsv', () => {
  const CABECALHO = 'semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max';

  it('lê campos com aspas, vírgulas, aspas escapadas, BOM e CRLF', () => {
    expect(lerCsv('﻿a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('converte as linhas válidas e acumula erros sem abortar o resto', () => {
    const { linhas, erros } = parsePlanilhaCsv(
      [
        CABECALHO,
        '1,2026-07-07,terca,1. Base,rodagem,45 min Leve,,5:15,5:30',
        'abc,2026-07-08,quarta,,rodagem,Leve,,,',
        '1,07/07/2026,quinta,,rodagem,Leve,,,',
        '1,2026-07-12,domingo,1. Base,longo,"3 km aq + 2,5 km volta","13,5",5:10,5:25',
        '1,2026-07-13,segunda,,rodagem,,,,',
      ].join('\n'),
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toMatchObject({ descricao: '3 km aq + 2,5 km volta', distanciaAlvoKm: 13.5 });
    expect(erros.map((e) => e.linha)).toEqual([3, 4, 6]);
  });

  it('rejeita arquivo sem as colunas esperadas', () => {
    expect(parsePlanilhaCsv('Semana,Período\n1,03/10').erros[0].motivo).toMatch(/Colunas ausentes/);
  });
});

describe('garmin', () => {
  it('reconhece corrida e mapeia a atividade', () => {
    expect(ehAtividadeDeCorrida({ activityId: 1, startTimeLocal: '', activityType: { typeKey: 'trail_running' } })).toBe(
      true,
    );
    expect(ehAtividadeDeCorrida({ activityId: 1, startTimeLocal: '', activityType: { typeKey: 'cycling' } })).toBe(false);
    expect(
      mapearAtividade({
        activityId: 24996111283,
        startTimeLocal: '2026-11-07 07:36:58',
        distance: 6036.8,
        duration: 2086.6,
        averageSpeed: 1000 / 346,
        averageHR: 133.7,
        maxHR: 152,
        elevationGain: 35,
      }),
    ).toEqual({
      garminActivityId: '24996111283',
      data: '2026-11-07',
      distanciaKm: 6.0368,
      duracaoSegundos: 2087,
      paceMedio: '5:46',
      fcMedia: 134,
      fcMax: 152,
      elevacaoM: 35,
    });
  });

  it('numera os tiros 1..N e repete o número no trote seguinte', () => {
    const intervalos = mapearLapsParaIntervalos([
      { intensidade: 'warmup' },
      { intensidade: 'active' },
      { intensidade: 'recovery' },
      { intensidade: 'active' },
      { intensidade: 'rest' },
      { intensidade: 'cooldown' },
      { intensidade: 'other' },
    ]);
    expect(intervalos.map((i) => [i.tipo, i.repeticaoNumero])).toEqual([
      ['warmup', null],
      ['run', 1],
      ['recovery', 1],
      ['run', 2],
      ['recovery', 2],
      ['cooldown', null],
      ['run', 3],
    ]);
  });

  // FIT sintético gerado com o Encoder do próprio SDK — sem dados reais.
  function fitComLaps(laps: LapMesg[]): Uint8Array {
    const inicio = new Date('2026-11-01T07:00:00Z');
    const encoder = new Encoder();
    const fileId: FileIdMesg = { manufacturer: 'development', product: 1, timeCreated: inicio, type: 'activity' };
    encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
    for (const lap of laps) {
      const comTempo: LapMesg = { timestamp: inicio, startTime: inicio, ...lap };
      encoder.onMesg(Profile.MesgNum.LAP, comTempo);
    }
    return encoder.close();
  }

  it('lê os laps do FIT dentro do ZIP do download-service', () => {
    const fit = fitComLaps([
      { intensity: 'warmup', totalTimerTime: 600, totalDistance: 1800, enhancedAvgSpeed: 3, avgHeartRate: 130 },
      { intensity: 'active', totalTimerTime: 90, totalDistance: 400, enhancedAvgSpeed: 4.44, avgHeartRate: 165 },
      { intensity: 'recovery', totalTimerTime: 60, totalDistance: 170, enhancedAvgSpeed: 2.83, avgHeartRate: 150 },
    ]);
    const laps = extrairLapsDoZip(zipSync({ '123_ACTIVITY.fit': fit }));
    expect(laps.map((l) => l.intensidade)).toEqual(['warmup', 'active', 'recovery']);
    expect(laps[1]).toMatchObject({ distancia: 400, duracao: 90, fcMedia: 165 });
  });

  it('rejeita ZIP sem .fit e bytes que não são FIT', () => {
    expect(() => extrairLapsDoZip(zipSync({ 'leiame.txt': strToU8('x') }))).toThrow(/sem arquivo .fit/);
    expect(() => extrairLapsDoFit(strToU8('não sou um FIT'))).toThrow(/FIT inválido/);
  });
});
