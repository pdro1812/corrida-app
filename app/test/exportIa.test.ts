import { Encoder, FileIdMesg, LapMesg, Profile, RecordMesg } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import {
  AmostraCompleta,
  analisarAtividade,
  AnaliseTreino,
  extrairAnaliseDoFit,
  fatorInclinacao,
  LapTempo,
  limparFc,
  percentilPonderado,
} from '../src/dominio/blocosFit';
import {
  compactar,
  EntradaExport,
  minutosPorZonaFc,
  minutosPorZonaPace,
  montarExportGrafo,
  PrevistoEntrada,
  PROMPT_ANALISE,
  zonasFc,
} from '../src/dominio/exportGrafo';
import { gerarBackup, restaurarBackup } from '../src/services/backup';
import { gerarExportIa, lerLimiares, salvarLimiares } from '../src/services/exportIa';
import { gravarAnalise } from '../src/services/metricas';
import { criarBancoDeTeste } from './bancoDeTeste';
import { trecho, treinoDeTiro } from './fixtures';

describe('blocos do FIT', () => {
  it('percentil ponderado pelo tempo e filtro de picos do sensor', () => {
    expect(percentilPonderado([{ v: 1, w: 9 }, { v: 100, w: 1 }], 0.5)).toBe(1);
    const limpas = limparFc([
      { t: 0, fc: 140 },
      { t: 1, fc: 190 }, // salto de 50 bpm em 1 s
      { t: 2, fc: 141 },
    ]);
    expect(limpas.map((a) => a.fc)).toEqual([140, undefined, 141]);
    expect(fatorInclinacao(2)).toBeCloseTo(1.07);
    expect(fatorInclinacao(-2)).toBeCloseTo(0.964);
  });

  it('separa aquecimento, tiros, trotes e desaquecimento e tira o sprint final', () => {
    const { amostras, laps } = treinoDeTiro();
    const a = analisarAtividade(amostras, laps) as AnaliseTreino;
    expect(a.blocos.map((b) => b.tipo)).toEqual(['aq', 'tiro', 'trote', 'tiro', 'trote', 'tiro', 'trote', 'tiro', 'trote', 'des']);

    // Sprint de 20 s a 5,6 m/s virou extra e não contamina o desaquecimento.
    expect(a.extras).toHaveLength(1);
    expect(a.extras[0].onde).toBe('no fim do treino');
    expect(a.extras[0].m).toBeGreaterThan(80);
    const des = a.blocos[a.blocos.length - 1];
    expect(des.pace).toEqual([357, 357, 357]); // 2,8 m/s = 5:57/km
    expect(des.fc?.[2]).toBe(138);

    const tiro = a.blocos[1];
    expect(tiro.pace?.[1]).toBe(222); // 4,5 m/s = 3:42/km
    expect(tiro.fcSs).toBe(165); // FC estável na 2ª metade, não a do início
    expect(tiro.quedaFc60).toBeGreaterThan(20);
    expect(tiro.cad).toBe(184);

    // Aquecimento: FC sem os 60 s iniciais; custo = FC x pace em min.
    expect(a.blocos[0].fc).toEqual([140, 140, 140]);
    expect(a.blocos[0].custo).toBe(Math.round((140 * 333) / 60));
    expect(Object.values(a.histFc).reduce((x, y) => x + y, 0)).toBeGreaterThan(1000);
  });

  it('contínuo sem laps: segmentos por km, deriva e parada fora do pace', () => {
    // 40 min a 3 m/s; FC sobe de 140 para 150 na 2ª metade; 2 min parado no meio.
    const amostras = [
      ...trecho(0, 1200, 3, () => 140, 0, 10),
      ...trecho(1200, 120, 0, () => 120, 3600, 10),
      ...trecho(1320, 1200, 3, () => 150, 3600, 10),
    ];
    const a = analisarAtividade(amostras, []) as AnaliseTreino;
    expect(a.blocos).toHaveLength(1);
    const b = a.blocos[0];
    expect(b.tipo).toBe('continuo');
    expect(b.pace).toEqual([333, 333, 333]); // parada não entra
    expect(b.derivaPct).toBeGreaterThan(5);
    expect(b.gap).toBe(333); // plano
    expect(a.seg).toHaveLength(7);
    expect(a.seg[0]).toEqual([1, 333, 140, 0, 170]);
    expect(a.extras).toHaveLength(0);
  });

  it('lê laps e amostras de um FIT real gerado pelo SDK', () => {
    const inicio = new Date('2026-11-01T07:00:00Z');
    const encoder = new Encoder();
    const fileId: FileIdMesg = { manufacturer: 'development', product: 1, timeCreated: inicio, type: 'activity' };
    encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
    const { amostras, laps } = treinoDeTiro();
    const em = (s: number) => new Date(inicio.getTime() + s * 1000);
    for (const a of amostras) {
      const record: RecordMesg = {
        timestamp: em(a.t),
        heartRate: a.fc,
        enhancedSpeed: a.vel,
        distance: a.dist,
        enhancedAltitude: 50,
        cadence: (a.cad as number) / 2,
      };
      encoder.onMesg(Profile.MesgNum.RECORD, record);
    }
    for (const lap of laps) {
      const intensidade = ({ warmup: 'warmup', run: 'active', recovery: 'recovery', cooldown: 'cooldown' } as const)[lap.tipo];
      const lapMesg: LapMesg = {
        startTime: em(lap.inicio),
        timestamp: em(lap.fim),
        totalElapsedTime: lap.fim - lap.inicio,
        intensity: intensidade,
      };
      encoder.onMesg(Profile.MesgNum.LAP, lapMesg);
    }
    const a = extrairAnaliseDoFit(encoder.close()) as AnaliseTreino;
    expect(a.blocos.filter((b) => b.tipo === 'tiro')).toHaveLength(4);
    expect(a.blocos[1].cad).toBe(184);
    expect(a.extras).toHaveLength(1);
  });
});

const previstoTiro: PrevistoEntrada = {
  id: 'p1',
  data: '2026-11-18',
  tipo: 'qualidade',
  descricao: '10 min aq + 4x400 @3:40-3:50 c/ 60s + 5 min desaq',
  distanciaAlvoKm: null,
  duracaoAlvoSegundos: null,
  paceAlvoMin: null,
  paceAlvoMax: null,
  status: 'realizado',
  motivoNaoRealizado: null,
  semana: { numero: 7, fase: 'específico', rotinaExtra: null },
  intervalos: [
    { ordem: 1, tipo: 'aquecimento', distanciaAlvoKm: null, duracaoAlvoSegundos: 600, paceAlvoMin: null, paceAlvoMax: null },
    ...[1, 2, 3, 4].flatMap((n) => [
      { ordem: n * 2, tipo: 'tiro', distanciaAlvoKm: 0.4, duracaoAlvoSegundos: null, paceAlvoMin: '3:40', paceAlvoMax: '3:50' },
      { ordem: n * 2 + 1, tipo: 'recuperacao', distanciaAlvoKm: null, duracaoAlvoSegundos: 60, paceAlvoMin: null, paceAlvoMax: null },
    ]),
    { ordem: 10, tipo: 'desaquecimento', distanciaAlvoKm: null, duracaoAlvoSegundos: 300, paceAlvoMin: null, paceAlvoMax: null },
  ],
};

function entrada(): EntradaExport {
  const { amostras, laps } = treinoDeTiro();
  return {
    geradoEm: '2026-11-20T23:00:00Z',
    inicio: '2026-11-14',
    fim: '2026-11-20',
    atleta: {
      fcLimiar: 172,
      paceLimiarS: 290,
      provaAlvo: { nome: 'Meia SM', data: '2027-01-24', distanciaKm: 21.1, metaTempoSegundos: 6240 },
    },
    bemEstar: [],
    previstos: [previstoTiro, { ...previstoTiro, id: 'p2', data: '2026-11-19', tipo: 'rodagem', descricao: '8 km leve', intervalos: [], status: 'nao_realizado', motivoNaoRealizado: 'chuva' }],
    realizados: [
      {
        id: 'r1',
        previstoId: 'p1',
        data: '2026-11-18',
        distanciaKm: 3.9,
        duracaoSegundos: 1520,
        paceMedio: '6:30',
        fcMedia: 148,
        elevacaoM: 5,
        rpe: 7,
        sensacoes: ['cansado'],
        feedbackTexto: 'pernas\n pesadas',
        sessao: null,
        analise: analisarAtividade(amostras, laps),
      },
    ],
  };
}

describe('export em grafo', () => {
  it('liga proposto e executado por bloco, sem mínimos e máximos', () => {
    const json = montarExportGrafo(entrada()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- leitura livre do JSON no teste
    expect(json.periodo).toEqual(['2026-11-14', '2026-11-20']);
    expect(json.atleta).toMatchObject({ fc_limiar: 172, pace_limiar: '4:50', zonas_fc: [0, 146, 155, 163, 172] });

    const dia = json.dias.find((d: { data: string }) => d.data === '2026-11-18');
    expect(dia.ciclo).toEqual({ semana: 7, fase: 'específico', dias_prova: 67 });
    const treino = dia.treinos[0];
    expect(treino.prop.blocos.map((b: { id: string }) => b.id)).toEqual(['aq', 't', 'des']);
    expect(treino.prop.blocos[1]).toEqual({ id: 't', rep: 4, m: 400, pace: ['3:40', '3:50'], rec_s: 60 });

    const exec = treino.exec[0];
    expect(exec.blocos.map((b: { id: string }) => b.id)).toEqual(['aq', 't', 'des']);
    const tiros = exec.blocos[1];
    expect(tiros.rep).toHaveLength(4);
    expect(tiros.rep[0].slice(0, 2)).toEqual([1, '3:42']);
    expect(tiros.resumo).toMatchObject({ dentro_alvo: '4/4', fc_ss_pct_limiar: 97 });
    expect(exec.extra).toEqual([expect.objectContaining({ onde: 'no fim do treino' })]);
    expect(exec.nota).toBe('pernas pesadas');
    expect(exec.zonas_fc_min).toHaveLength(5);
    expect(exec.pace_medio).toBeUndefined(); // com blocos, o resumo bruto sai

    // Dia sem treino feito: proposto + status + motivo.
    const perdido = json.dias.find((d: { data: string }) => d.data === '2026-11-19');
    expect(perdido.treinos[0]).toMatchObject({ status: 'nao_realizado', motivo: 'chuva', prop: { tipo: 'rodagem' } });

    const texto = JSON.stringify(json);
    expect(texto).not.toMatch(/"fc_max"|"max_|null/);
    expect(texto.length).toBeLessThan(6000);
  });

  it('zonas a partir dos histogramas e compactação', () => {
    expect(zonasFc(172)).toEqual([0, 146, 155, 163, 172]);
    expect(minutosPorZonaFc({ '140': 600, '150': 120, '175': 60 }, 172)).toEqual([10, 2, 0, 0, 1]);
    expect(minutosPorZonaPace({ '400': 600, '290': 120 }, 290)).toEqual([10, 0, 0, 0, 2]);
    expect(compactar({ a: null, b: [], c: { d: undefined }, e: 0, f: 'x' })).toEqual({ e: 0, f: 'x' });
  });

  it('desvios do contexto contra os 28 dias anteriores', () => {
    const e = entrada();
    const base = (data: string, hrv: number) => ({
      data, sonoHoras: 7, sonoScore: 80, hrvNoite: hrv, hrvStatus: null, stressMedio: 25, bodyBatteryMax: 80,
      bodyBatteryMin: 20, fcRepouso: 50, vo2max: null, sonoProfundoMin: null, sonoRemMin: null, despertares: null,
      respiracaoSono: null, stressSono: null, hrvSemanal: null, bodyBatteryCarregado: null, bodyBatteryGasto: null,
    });
    e.bemEstar = [
      ...Array.from({ length: 10 }, (_, i) => base(`2026-11-${String(i + 1).padStart(2, '0')}`, i % 2 ? 50 : 60)),
      base('2026-11-18', 40),
    ];
    const json = montarExportGrafo(e) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- leitura livre do JSON no teste
    const dia = json.dias.find((d: { data: string }) => d.data === '2026-11-18');
    expect(dia.ctx.hrv).toBe(40);
    expect(dia.ctx.dz.hrv).toBe(-3);
    expect(json.atleta.fc_rep_base).toBe(50);
  });
});

describe('export (serviço)', () => {
  it('salva limiares, lê o banco e gera prompt + JSON do período', async () => {
    const banco = await criarBancoDeTeste();
    await expect(salvarLimiares('90', '')).rejects.toThrow('FC de limiar');
    await expect(salvarLimiares('172', '450')).rejects.toThrow('m:ss');
    await salvarLimiares('172', '4:50');
    expect(await lerLimiares()).toEqual({ fcLimiar: 172, paceLimiar: '4:50' });

    await banco.executar("INSERT INTO ciclo (id, nome, data_inicio, data_fim, status, criado_em) VALUES ('c', 'Meia', '2026-10-01', '2027-01-30', 'ativo', 'x')");
    await banco.executar("INSERT INTO semana (id, ciclo_id, numero_semana, data_inicio, data_fim, fase) VALUES ('s', 'c', 7, '2026-11-16', '2026-11-22', 'específico')");
    await banco.executar(
      "INSERT INTO treino_previsto (id, semana_id, dia_semana, data, tipo, descricao, status) VALUES ('p1', 's', 'qua', '2026-11-18', 'qualidade', '4x400', 'realizado')",
    );
    await banco.executar(
      "INSERT INTO treino_previsto_intervalo (id, treino_previsto_id, ordem, tipo, repeticao_numero, distancia_alvo_km, pace_alvo_min, pace_alvo_max) VALUES ('i1', 'p1', 1, 'tiro', 1, 0.4, '3:40', '3:50')",
    );
    for (const [id, data, previsto] of [['r1', '2026-11-18', 'p1'], ['r0', '2026-08-01', null]]) {
      await banco.executar(
        "INSERT INTO treino_realizado (id, treino_previsto_id, data, distancia_km, duracao_segundos, fc_media, criado_em) VALUES (?, ?, ?, 4, 1500, 150, 'x')",
        [id, previsto, data],
      );
    }
    const { amostras, laps } = treinoDeTiro();
    await gravarAnalise(banco, 'r1', analisarAtividade(amostras, laps) as AnaliseTreino);

    const texto = await gerarExportIa(1, new Date('2026-11-20T12:00:00Z'));
    expect(texto.startsWith(PROMPT_ANALISE)).toBe(true);
    const json = JSON.parse(texto.slice(texto.indexOf('```json') + 7, texto.lastIndexOf('```')));
    expect(json.periodo).toEqual(['2026-11-14', '2026-11-20']);
    expect(json.dias).toHaveLength(1);
    expect(json.dias[0].treinos[0].exec[0].blocos.map((b: { id: string }) => b.id)).toEqual(['aq', 't', 'des']);
    expect(texto).not.toContain('2026-08-01');

    const tudo = await gerarExportIa(null, new Date('2026-11-20T12:00:00Z'));
    expect(tudo).toContain('2026-08-01');

    // A análise entra no backup e volta na restauração.
    const backup = await gerarBackup();
    expect(backup.tabelas.treino_analise).toHaveLength(1);
    await restaurarBackup(JSON.stringify(backup));
    expect(await banco.todos('SELECT treino_realizado_id FROM treino_analise')).toEqual([{ treino_realizado_id: 'r1' }]);
  });
});
