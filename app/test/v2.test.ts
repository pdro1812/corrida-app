import { Encoder, FileIdMesg, Profile, RecordMesg, SessionMesg } from '@garmin/fitsdk';
import { describe, expect, it, vi } from 'vitest';
import { descreverTempo, horaDeReferencia, lerClima, montarUrlClima } from '../src/dominio/clima';
import { calcularCustoEsforco, indiceCustoRelativo } from '../src/dominio/custoEsforco';
import {
  AmostraFit,
  calcularDesacoplamento,
  extrairMetricasDoFit,
  MetricasFit,
  metricasDaSessao,
} from '../src/dominio/metricasFit';
import { gerarBackup, restaurarBackup } from '../src/services/backup';
import { completarClimaPendente, gravarMetricasFit } from '../src/services/metricas';
import { listarTreinosSemRpe } from '../src/services/rpe';
import { montarExportIa, TreinoParaExport } from '../src/dominio/exportIa';
import { gerarExportIa } from '../src/services/exportIa';
import { descreverEstrutura, enriquecerRegistro, podarJson, resumirDia, separarPorDia } from '../src/dominio/bemEstar';
import { listarBemEstar, sincronizarBemEstar } from '../src/services/bemEstar';
import { calcularProntidao } from '../src/dominio/analise';
import { criarBancoDeTeste } from './bancoDeTeste';

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

describe('clima (Open-Meteo)', () => {
  it('usa a hora cheia do meio do treino e arredonda a coordenada', () => {
    expect(horaDeReferencia('2026-11-01T07:10:00.000Z', 3600)).toBe('2026-11-01T08:00');
    const url = new URL(montarUrlClima(-29.68456, -53.80612, '2026-11-01T08:00', new Date('2026-11-12T00:00:00Z')));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('-29.68');
    expect(url.searchParams.get('longitude')).toBe('-53.81');
    expect(url.searchParams.get('start_date')).toBe('2026-11-01');
    // Treinos antigos vão para o arquivo histórico
    expect(montarUrlClima(-29.68, -53.81, '2026-01-10T08:00', new Date('2026-11-12T00:00:00Z'))).toMatch(
      /^https:\/\/archive-api\.open-meteo\.com/,
    );
  });

  it('lê a hora certa da resposta', () => {
    const resposta = {
      hourly: {
        time: ['2026-11-01T07:00', '2026-11-01T08:00'],
        temperature_2m: [18, 21.5],
        apparent_temperature: [18, 23],
        relative_humidity_2m: [80, 70],
        dew_point_2m: [14, 15.8],
        wind_speed_10m: [5, 9],
        precipitation: [0, 0],
        weather_code: [1, 2],
      },
    };
    expect(lerClima(resposta, '2026-11-01T08:00')).toEqual({
      temperaturaC: 21.5,
      sensacaoTermicaC: 23,
      umidadePct: 70,
      pontoOrvalhoC: 15.8,
      ventoKmh: 9,
      precipitacaoMm: 0,
      codigoTempo: 2,
    });
    expect(lerClima(resposta, '2026-11-01T09:00')).toBeNull();
    expect(lerClima(null, '2026-11-01T08:00')).toBeNull();
    expect(descreverTempo(2)).toBe('parcialmente nublado');
  });
});

describe('treino_metricas no banco', () => {
  const metricasVazias = Object.fromEntries(
    Object.keys(metricasDaSessao(undefined, [])).map((k) => [k, null]),
  ) as unknown as MetricasFit;

  it('grava métricas, busca clima uma vez e entra no backup', async () => {
    const banco = await criarBancoDeTeste();
    await banco.executar(
      "INSERT INTO treino_realizado (id, garmin_activity_id, data, duracao_segundos, criado_em) VALUES ('r1', '9', '2026-11-01', 3600, 'x')",
    );
    await gravarMetricasFit(banco, 'r1', {
      ...metricasVazias,
      horaInicio: '2026-11-01T07:10:00.000Z',
      latitudeInicio: -29.684567,
      longitudeInicio: -53.806123,
      cadenciaMediaPpm: 172,
    });
    const linha = await banco.primeiro<{ latitude: number; cadencia_media_ppm: number }>(
      'SELECT latitude, cadencia_media_ppm FROM treino_metricas',
    );
    expect(linha).toEqual({ latitude: -29.68, cadencia_media_ppm: 172 }); // guardada já arredondada

    const buscarJson = vi.fn(async () => ({
      hourly: { time: ['2026-11-01T08:00'], temperature_2m: [24], weather_code: [0] },
    }));
    expect(await completarClimaPendente(banco, buscarJson)).toBe(1);
    expect(await completarClimaPendente(banco, buscarJson)).toBe(0); // não repete
    expect(buscarJson).toHaveBeenCalledTimes(1);

    // Reler o FIT não apaga o clima
    await gravarMetricasFit(banco, 'r1', { ...metricasVazias, cadenciaMediaPpm: 175 });
    const depois = await banco.primeiro<{ clima_temperatura_c: number; cadencia_media_ppm: number }>(
      'SELECT clima_temperatura_c, cadencia_media_ppm FROM treino_metricas',
    );
    expect(depois).toEqual({ clima_temperatura_c: 24, cadencia_media_ppm: 175 });

    const backup = await gerarBackup();
    expect(backup.tabelas.treino_metricas).toHaveLength(1);
    await restaurarBackup(JSON.stringify(backup));
    expect(await banco.todos('SELECT * FROM treino_metricas')).toHaveLength(1);
  });
});

describe('RPE pendente', () => {
  it('lista só treinos da Garmin da última semana sem RPE', async () => {
    const banco = await criarBancoDeTeste();
    const inserir = (id: string, data: string, fonte: string, rpe: number | null) =>
      banco.executar('INSERT INTO treino_realizado (id, fonte, data, rpe, distancia_km, criado_em) VALUES (?, ?, ?, ?, 8, ?)', [
        id,
        fonte,
        data,
        rpe,
        data,
      ]);
    await inserir('novo', '2026-11-11', 'garmin', null);
    await inserir('avaliado', '2026-11-10', 'garmin', 6);
    await inserir('manual', '2026-11-10', 'manual', null);
    await inserir('antigo', '2026-10-01', 'garmin', null);
    expect((await listarTreinosSemRpe('2026-11-12')).map((t) => t.id)).toEqual(['novo']);
  });
});

describe('export para o Claude', () => {
  const treinoBase: TreinoParaExport = {
    data: '2026-11-02',
    tipoPrevisto: 'rodagem',
    descricaoPrevista: '10 km fácil; Z2',
    paceAlvoMin: '5:25',
    paceAlvoMax: '5:50',
    distanciaKm: 10,
    duracaoSegundos: 3000,
    paceMedio: '5:00',
    fcMedia: 150,
    fcMax: 165,
    elevacaoM: 0,
    rpe: 4,
    sensacoes: ['bem_encaixado'],
    feedbackTexto: 'tranquilo\nsem dor',
    cadenciaPpm: 172,
    potenciaW: 250,
    efeitoAerobico: 3.1,
    efeitoAnaerobico: 0.5,
    desacoplamentoPct: 2.1,
    temperaturaC: 15,
    sensacaoTermicaC: 15,
    umidadePct: 70,
    ventoKmh: 8,
    codigoTempo: 0,
    intervalos: [],
  };

  it('gera Markdown compacto com custo relativo ao histórico do mesmo tipo', () => {
    const treinos = [
      treinoBase,
      { ...treinoBase, data: '2026-11-04' },
      { ...treinoBase, data: '2026-11-06' },
      { ...treinoBase, data: '2026-11-09', fcMedia: 165, temperaturaC: 15 }, // 10% mais batimentos
    ];
    const md = montarExportIa(treinos, { geradoEm: '2026-11-12T10:00:00Z', periodo: 'últimas 4 semanas' });
    expect(md).toContain('# Meus treinos de corrida');
    const linhas = md.split('\n').filter((l) => /^2026-11-\d\d;rodagem;/.test(l));
    expect(linhas).toHaveLength(4);
    expect(linhas[0].split(';')).toHaveLength(28); // mesmo número de colunas do cabeçalho
    expect(linhas[0].split(';')[22]).toBe(''); // sem histórico ainda
    expect(linhas[3].split(';')[22]).toBe('110');
    expect(md).toContain('10 km fácil Z2'); // ';' e quebras de linha não quebram o CSV
    expect(md).toContain('2026-11-02;30.0;3;2:30:00;4.0;600'); // semana: km, treinos, tempo, rpe, carga
    expect(md).toContain('2026-11-09;10.0;1');
    expect(md).not.toMatch(/latitude|longitude|-29\./);
  });

  it('lista os intervalos dos treinos de qualidade', () => {
    const md = montarExportIa(
      [
        {
          ...treinoBase,
          tipoPrevisto: 'qualidade',
          intervalos: [
            { tipo: 'warmup', distanciaKm: 2, tempoSegundos: 660, paceMedio: '5:30', fcMedia: 140 },
            { tipo: 'run', distanciaKm: 1, tempoSegundos: 252, paceMedio: '4:12', fcMedia: 172 },
          ],
        },
      ],
      { geradoEm: '2026-11-12T10:00:00Z', periodo: 'tudo' },
    );
    expect(md).toContain('- 2026-11-02: aq 2.00km 11:00 5:30/km 140bpm | T 1.00km 4:12 4:12/km 172bpm');
  });

  it('busca no banco só o período pedido', async () => {
    const banco = await criarBancoDeTeste();
    for (const data of ['2026-11-10', '2026-08-01']) {
      await banco.executar(
        "INSERT INTO treino_realizado (id, data, distancia_km, duracao_segundos, fc_media, criado_em) VALUES (?, ?, 8, 2400, 150, 'x')",
        [data, data],
      );
    }
    const md = await gerarExportIa(4, new Date('2026-11-12T12:00:00Z'));
    expect(md).toContain('2026-11-10;sem_plano');
    expect(md).not.toContain('2026-08-01;');
    expect(await gerarExportIa(null, new Date('2026-11-12T12:00:00Z'))).toContain('2026-08-01;sem_plano');
  });
});

describe('bem-estar (sono, HRV, Body Battery)', () => {
  it('separa por dia, poda séries e lê campos por nomes candidatos', () => {
    const sono = [
      { calendarDate: '2026-11-10', sleepTimeSeconds: 27000, overallSleepScore: { value: 82 }, epocas: Array(200).fill(1) },
    ];
    const hrv = { hrvSummaries: [{ calendarDate: '2026-11-10', lastNightAvg: 58, status: 'BALANCED' }] };
    const dias = separarPorDia(sono);
    expect([...dias.keys()]).toEqual(['2026-11-10']);
    expect(podarJson(dias.get('2026-11-10'))).not.toHaveProperty('epocas');
    expect(
      resumirDia('2026-11-10', {
        sono: dias.get('2026-11-10'),
        hrv: separarPorDia(hrv).get('2026-11-10'),
        resumo: { restingHeartRate: 48, bodyBatteryHighestValue: 90 },
      }),
    ).toMatchObject({ sonoHoras: 7.5, sonoScore: 82, hrvNoite: 58, hrvStatus: 'BALANCED', fcRepouso: 48, bodyBatteryMax: 90 });
    expect(descreverEstrutura({ a: 1, b: [{ c: 'x' }] })).toBe('{ a: number, b: [1× { c: string }] }');
  });

  it('sincroniza todas as fontes, tolera fonte fora do ar e entra no export', async () => {
    const banco = await criarBancoDeTeste();
    const buscarJson = vi.fn(async (caminho: string) => {
      if (caminho.startsWith('/hrv-service')) throw new Error('HTTP 404');
      if (caminho.startsWith('/sleep-service')) return [{ calendarDate: '2026-11-11', sleepTimeSeconds: 25200 }];
      return [];
    });
    const resultado = await sincronizarBemEstar(banco, buscarJson, '2026-11-12');
    expect(resultado).toMatchObject({ sono: true, hrv: false });
    expect(buscarJson.mock.calls[0][0]).toContain('startDate=2026-10-13&endDate=2026-11-12');
    expect(await listarBemEstar('2026-11-01')).toMatchObject([{ data: '2026-11-11', sonoHoras: 7 }]);

    // Próximo sync só pede os últimos dias (com sobreposição)
    await sincronizarBemEstar(banco, buscarJson, '2026-11-13');
    expect(buscarJson.mock.calls.at(-1)?.[0]).toContain('/2026-11-10/2026-11-13');

    const md = await gerarExportIa(4, new Date('2026-11-12T12:00:00Z'));
    expect(md).toContain('## Recuperação diária');
    expect(md).toContain('2026-11-11;7;');
  });
});

describe('análise (Lab)', () => {
  const dia = (data: string, hrv: number | null, fc: number | null) => ({
    data,
    sonoHoras: 7,
    sonoScore: null,
    hrvNoite: hrv,
    hrvStatus: null,
    stressMedio: null,
    bodyBatteryMax: 80,
    bodyBatteryMin: null,
    fcRepouso: fc,
    vo2max: null,
    sonoProfundoMin: null,
    sonoRemMin: null,
    despertares: null,
    respiracaoSono: null,
    stressSono: null,
    hrvSemanal: null,
    bodyBatteryCarregado: null,
    bodyBatteryGasto: null,
  });

  it('compara a prontidão do último dia com a semana anterior', () => {
    const dias = ['01', '02', '03', '04', '05', '06', '07'].map((d) => dia(`2026-11-${d}`, 60, 48));
    dias.push(dia('2026-11-08', 45, 54));
    expect(calcularProntidao(dias)).toMatchObject({
      data: '2026-11-08',
      hrvNoite: 45,
      hrvVariacaoPct: -25,
      fcRepouso: 54,
      fcRepousoVariacao: 6,
    });
    expect(calcularProntidao([]).data).toBeNull();
  });
});

describe('bem-estar com o formato real da Personal API (valores sintéticos)', () => {
  it('lê sono, HRV, stress e Body Battery como o diagnóstico mostrou', () => {
    const sono = [
      {
        calendarDate: '2026-11-12',
        sleepTimeSeconds: 26400,
        deepSleepSeconds: 5400,
        remSleepSeconds: 6000,
        awakeCount: 2,
        averageRespirationValue: 14.2,
        avgSleepStress: 18,
        sleepScores: { totalDuration: { qualifierKey: 'GOOD' }, overall: { value: 81, qualifierKey: 'GOOD' } },
        sleepNeed: { calendarDate: '2026-11-12', baseline: 480 },
      },
    ];
    const hrv = { hrvSummaries: [{ calendarDate: '2026-11-12', weeklyAvg: 57, lastNightAvg: 52, status: 'BALANCED' }], userProfilePk: 1 };
    const stress = [{ calendarDate: '2026-11-12', values: { overallStressLevel: 31, lowStressDuration: 100 } }];
    const bb = [
      {
        date: '2026-11-12',
        charged: 55,
        drained: 60,
        bodyBatteryValuesArray: [[1, 30], [2, 85], [3, 41]],
      },
    ];
    const dia = (r: unknown) => separarPorDia(r).get('2026-11-12');
    const bbDia = enriquecerRegistro('body_battery', dia(bb)!);
    expect(
      resumirDia('2026-11-12', {
        sono: podarJson(dia(sono)),
        hrv: dia(hrv),
        stress: dia(stress),
        body_battery: podarJson(bbDia),
      }),
    ).toMatchObject({
      sonoHoras: 7.3,
      sonoScore: 81,
      sonoProfundoMin: 90,
      sonoRemMin: 100,
      despertares: 2,
      respiracaoSono: 14.2,
      stressSono: 18,
      hrvNoite: 52,
      hrvSemanal: 57,
      hrvStatus: 'BALANCED',
      stressMedio: 31,
      bodyBatteryMax: 85,
      bodyBatteryMin: 30,
      bodyBatteryCarregado: 55,
      bodyBatteryGasto: 60,
    });
  });
});
