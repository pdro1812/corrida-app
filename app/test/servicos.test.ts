import { Encoder, FileIdMesg, LapMesg, Profile } from '@garmin/fitsdk';
import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Banco } from '../src/db/banco';
import { atualizarCiclo, buscarCiclo, criarCiclo, excluirCiclo, listarCiclos } from '../src/services/ciclos';
import { criarProva, excluirProva, listarProvas } from '../src/services/provas';
import { excluirImportacao, importarPlanilha, listarImportacoes } from '../src/services/import';
import { listarSemanasDoCiclo } from '../src/services/semanas';
import { buscarTreinoPrevisto, registrarFeedback, registrarTreinoManual } from '../src/services/treinos';
import {
  excluirTreinoRealizado,
  listarTreinosRealizados,
  vincularTreinoRealizado,
} from '../src/services/treinosRealizados';
import { casarPendentesComPrevisto, esquecerTokenGarmin, sincronizarGarmin } from '../src/services/sync';
import { salvarChaveGarmin, removerChaveGarmin } from '../src/services/configuracoes';
import { gerarBackup, restaurarBackup } from '../src/services/backup';
import { criarBancoDeTeste } from './bancoDeTeste';

let banco: Banco;

const PLANILHA = [
  'semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max',
  '1,2026-10-06,terca,Retomada,rodagem,10 km fácil,10,5:25,5:50',
  '1,2026-10-08,quinta,Retomada,qualidade,2km Leve + 4x 1km (90s trote) + 1km Leve,,4:15,4:20',
  '1,2026-10-11,domingo,Retomada,longo,12 km Z2,12,5:20,5:45',
  '2,2026-10-13,terca,Retomada,rodagem,45 min Leve,,5:30,5:50',
].join('\n');

async function cicloComPlanilha() {
  const ciclo = await criarCiclo({
    nome: 'Maratona POA 2027',
    dataInicio: '2026-10-03',
    dataFim: '2027-06-06',
    provaNome: 'Maratona Internacional de Porto Alegre',
    provaData: '2027-06-06',
    provaDistanciaKm: 42.195,
  });
  await importarPlanilha(ciclo.id, PLANILHA, 'plano.csv');
  return ciclo;
}

const idDoPrevisto = async (data: string) =>
  (await banco.primeiro<{ id: string }>('SELECT id FROM treino_previsto WHERE data = ?', [data]))!.id;

const statusDoPrevisto = async (data: string) =>
  (await banco.primeiro<{ status: string }>('SELECT status FROM treino_previsto WHERE data = ?', [data]))!.status;

beforeEach(async () => {
  banco = await criarBancoDeTeste();
});

describe('ciclos e provas', () => {
  it('cria o ciclo com a prova alvo e edita os dois juntos', async () => {
    const ciclo = await cicloComPlanilha();
    expect(ciclo.provas).toEqual([expect.objectContaining({ tipo: 'alvo', data: '2027-06-06', concluida: false })]);

    const editado = await atualizarCiclo(ciclo.id, { provaMetaTempoSegundos: 12600, status: 'concluido' });
    expect(editado.status).toBe('concluido');
    expect(editado.provas[0].metaTempoSegundos).toBe(12600);
    expect(await listarCiclos('ativo')).toEqual([]);
  });

  it('não deixa excluir a prova alvo nem criar uma segunda', async () => {
    const ciclo = await cicloComPlanilha();
    await expect(excluirProva(ciclo.provas[0].id)).rejects.toThrow(/prova alvo/);
    await expect(criarProva(ciclo.id, { nome: 'Outra', data: '2027-01-01', tipo: 'alvo' })).rejects.toThrow(/já tem/);
    const secundaria = await criarProva(ciclo.id, { nome: 'Meia', data: '2027-03-01', distanciaKm: 21.1 });
    expect((await listarProvas(ciclo.id)).map((p) => p.tipo)).toEqual(['secundaria', 'alvo']);
    await excluirProva(secundaria.id);
  });

  it('excluir o ciclo apaga o plano mas mantém os treinos realizados', async () => {
    const ciclo = await cicloComPlanilha();
    await registrarTreinoManual({ treinoPrevistoId: await idDoPrevisto('2026-10-06'), data: '2026-10-06', distanciaKm: 10 });
    await excluirCiclo(ciclo.id);
    await expect(buscarCiclo(ciclo.id)).rejects.toThrow(/não encontrado/);
    expect(await banco.todos('SELECT id FROM treino_previsto')).toEqual([]);
    expect(await listarTreinosRealizados()).toEqual([expect.objectContaining({ treinoPrevistoId: null })]);
  });
});

describe('import da planilha', () => {
  it('cria semanas, treinos e intervalos, e calcula os totais da semana', async () => {
    const ciclo = await cicloComPlanilha();
    const semanas = await listarSemanasDoCiclo(ciclo.id);
    expect(semanas.map((s) => [s.numeroSemana, s.dataInicio, s.dataFim, s.treinosPrevistos.length])).toEqual([
      [1, '2026-10-06', '2026-10-11', 3],
      [2, '2026-10-13', '2026-10-13', 1],
    ]);
    // 10 + (2 + 4x1 + 4x90s a 5:30 + 1) + 12
    expect(semanas[0].kmPlanejadoTotal).toBeCloseTo(10 + 7 + 360 / 330 + 12);
    // "45 min Leve" vira duração alvo e entra no tempo da semana
    expect(semanas[1].tempoPlanejadoTotalSegundos).toBe(2700);

    const qualidade = semanas[0].treinosPrevistos[1];
    expect(qualidade.intervalos?.filter((i) => i.tipo === 'tiro').map((i) => i.repeticaoNumero)).toEqual([1, 2, 3, 4]);
  });

  it('reaproveita semanas existentes e excluir a importação remove só os treinos dela', async () => {
    const ciclo = await cicloComPlanilha();
    const segunda = await importarPlanilha(
      ciclo.id,
      'semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max\n2,2026-10-14,quarta,,rodagem,8 km,8,,',
    );
    expect(segunda).toMatchObject({ semanasCriadas: 0, semanasReaproveitadas: 1, treinosCriados: 1 });
    expect(await listarImportacoes(ciclo.id)).toHaveLength(2);

    await excluirImportacao(segunda.importacaoId);
    const semanas = await listarSemanasDoCiclo(ciclo.id);
    expect(semanas[1].treinosPrevistos.map((t) => t.data)).toEqual(['2026-10-13']);
  });

  it('não grava nada quando a planilha é inválida e devolve os erros', async () => {
    const ciclo = await cicloComPlanilha();
    const resultado = await importarPlanilha(ciclo.id, 'semana,data\n1,2026-10-06');
    expect(resultado.treinosCriados).toBe(0);
    expect(resultado.linhasComErro[0].motivo).toMatch(/Colunas ausentes/);
  });
});

describe('treinos realizados e vínculo (RF15/RF16/RF18)', () => {
  it('registro manual marca o previsto como realizado e guarda o feedback', async () => {
    await cicloComPlanilha();
    const previstoId = await idDoPrevisto('2026-10-06');
    const realizado = await registrarTreinoManual({ treinoPrevistoId: previstoId, data: '2026-10-06', distanciaKm: 10.2 });
    expect(await statusDoPrevisto('2026-10-06')).toBe('realizado');

    const comFeedback = await registrarFeedback(realizado.id, { rpe: 4, sensacoes: ['bem_encaixado'], feedbackTexto: 'ok' });
    expect(comFeedback).toMatchObject({ rpe: 4, sensacoes: ['bem_encaixado'], feedbackTexto: 'ok', fonte: 'manual' });
  });

  it('religar libera o previsto antigo só quando não sobra outro realizado', async () => {
    await cicloComPlanilha();
    const terca = await idDoPrevisto('2026-10-06');
    const quinta = await idDoPrevisto('2026-10-08');
    const a = await registrarTreinoManual({ treinoPrevistoId: terca, data: '2026-10-06' });
    const b = await registrarTreinoManual({ treinoPrevistoId: terca, data: '2026-10-07' });

    await vincularTreinoRealizado(b.id, quinta);
    expect(await statusDoPrevisto('2026-10-06')).toBe('realizado'); // `a` continua ligado
    expect(await statusDoPrevisto('2026-10-08')).toBe('realizado');

    await vincularTreinoRealizado(a.id, null);
    expect(await statusDoPrevisto('2026-10-06')).toBe('pendente');

    await excluirTreinoRealizado(b.id);
    expect(await statusDoPrevisto('2026-10-08')).toBe('pendente');
  });

  it('casa realizados sem vínculo com o previsto mais próximo (± 1 dia) e não mexe em vínculos manuais', async () => {
    await cicloComPlanilha();
    const avulso = await registrarTreinoManual({ data: '2026-10-12' }); // segunda: domingo 11 é o mais próximo
    const longe = await registrarTreinoManual({ data: '2026-10-20' }); // nenhum previsto perto
    const manual = await registrarTreinoManual({ treinoPrevistoId: await idDoPrevisto('2026-10-13'), data: '2026-10-14' });

    expect(await casarPendentesComPrevisto(banco)).toBe(1);
    const realizados = await listarTreinosRealizados();
    const porId = new Map(realizados.map((r) => [r.id, r]));
    expect(porId.get(avulso.id)?.treinoPrevisto?.data).toBe('2026-10-11');
    expect(porId.get(longe.id)?.treinoPrevisto).toBeNull();
    expect(porId.get(manual.id)?.treinoPrevisto?.data).toBe('2026-10-13');
  });
});

describe('sincronização com a Garmin (fetch simulado)', () => {
  function fit(): Uint8Array {
    const inicio = new Date('2026-10-08T07:00:00Z');
    const encoder = new Encoder();
    const fileId: FileIdMesg = { manufacturer: 'development', product: 1, timeCreated: inicio, type: 'activity' };
    encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
    const laps: LapMesg[] = [
      { intensity: 'warmup', totalTimerTime: 700, totalDistance: 2000, enhancedAvgSpeed: 2.86 },
      { intensity: 'active', totalTimerTime: 255, totalDistance: 1000, enhancedAvgSpeed: 3.92 },
      { intensity: 'recovery', totalTimerTime: 90, totalDistance: 250, enhancedAvgSpeed: 2.78 },
    ];
    for (const lap of laps) encoder.onMesg(Profile.MesgNum.LAP, { timestamp: inicio, startTime: inicio, ...lap });
    return encoder.close();
  }

  const jwt = (horas: number) =>
    `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + horas * 3600 })).toString('base64url')}.y`;

  const atividades = [
    {
      activityId: 111,
      startTimeLocal: '2026-10-08 07:00:00',
      distance: 7200,
      duration: 2200,
      averageSpeed: 3.27,
      lapCount: 3,
      activityType: { typeKey: 'running' },
    },
    { activityId: 222, startTimeLocal: '2026-10-09 18:00:00', distance: 20000, activityType: { typeKey: 'cycling' } },
  ];

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    esquecerTokenGarmin();
    await salvarChaveGarmin('chave-de-teste');
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/personal-api-key/token')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('ApiKey chave-de-teste');
        return new Response(jwt(24));
      }
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer x\./);
      if (url.includes('/activities/search/activities')) return new Response(JSON.stringify(atividades));
      if (url.includes('/download-service/files/activity/111')) return new Response(new Blob([zipSync({ '111_ACTIVITY.fit': fit() }) as Uint8Array<ArrayBuffer>]));
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('importa corridas com os laps do FIT, ignora o resto e casa com o previsto', async () => {
    await cicloComPlanilha();
    const resultado = await sincronizarGarmin();
    expect(resultado).toEqual({
      ok: true,
      atividadesEncontradas: 2,
      atividadesImportadas: 1,
      atividadesJaExistentes: 0,
      treinosCasadosComPrevisto: 1,
    });

    const treino = await buscarTreinoPrevisto(await idDoPrevisto('2026-10-08'));
    expect(treino.status).toBe('realizado');
    expect(treino.realizados[0]).toMatchObject({ garminActivityId: '111', distanciaKm: 7.2, paceMedio: '5:06' });
    expect(treino.realizados[0].intervalos?.map((i) => [i.tipo, i.repeticaoNumero])).toEqual([
      ['warmup', null],
      ['run', 1],
      ['recovery', 1],
    ]);

    // Idempotente (RF14) e reaproveita o token
    expect(await sincronizarGarmin()).toMatchObject({ atividadesImportadas: 0, atividadesJaExistentes: 1 });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/token'))).toHaveLength(1);
  });

  it('nunca lança: sem chave ou com a Garmin fora do ar devolve ok:false (RNF12)', async () => {
    await removerChaveGarmin();
    expect(await sincronizarGarmin()).toMatchObject({ ok: false, erro: expect.stringMatching(/Configure a chave/) });

    await salvarChaveGarmin('chave-de-teste');
    fetchMock.mockImplementation(async () => new Response('', { status: 401 }));
    expect(await sincronizarGarmin()).toMatchObject({ ok: false, erro: expect.stringMatching(/inválida ou expirada/) });

    fetchMock.mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await sincronizarGarmin()).toMatchObject({ ok: false, erro: expect.stringMatching(/internet/) });
  });
});

describe('backup', () => {
  it('exporta e restaura todos os dados, substituindo o que havia', async () => {
    const ciclo = await cicloComPlanilha();
    const realizado = await registrarTreinoManual({
      treinoPrevistoId: await idDoPrevisto('2026-10-06'),
      data: '2026-10-06',
      distanciaKm: 10,
      sensacoes: ['cansado'],
    });
    const json = JSON.stringify(await gerarBackup());

    await excluirCiclo(ciclo.id);
    await excluirTreinoRealizado(realizado.id);
    await criarCiclo({ nome: 'Outro', dataInicio: '2027-01-01', dataFim: '2027-02-01', provaNome: 'X', provaData: '2027-02-01' });

    expect(await restaurarBackup(json)).toEqual({ ciclos: 1, treinosPrevistos: 4, treinosRealizados: 1 });
    const ciclos = await listarCiclos();
    expect(ciclos.map((c) => c.nome)).toEqual(['Maratona POA 2027']);
    expect((await listarSemanasDoCiclo(ciclo.id))[0].treinosPrevistos[0].realizados[0]).toMatchObject({
      id: realizado.id,
      sensacoes: ['cansado'],
    });
  });

  it('rejeita arquivos adulterados ou de outro app sem apagar nada', async () => {
    await cicloComPlanilha();
    const backup = await gerarBackup();

    const adulterado = structuredClone(backup);
    (adulterado.tabelas.ciclo[0] as Record<string, unknown>)['nome); DROP TABLE ciclo; --'] = 'x';
    await expect(restaurarBackup(JSON.stringify(adulterado))).rejects.toThrow(/Coluna desconhecida/);
    await expect(restaurarBackup(JSON.stringify({ ...backup, tabelas: { usuarios: [] } }))).rejects.toThrow(/Tabela desconhecida/);
    await expect(restaurarBackup('{"formato":"outro"}')).rejects.toThrow(/não é um backup/);
    await expect(restaurarBackup('não é json')).rejects.toThrow(/não é JSON/);

    // Linha que quebra a FK no meio do restore: transação desfaz tudo.
    const fkQuebrada = structuredClone(backup);
    fkQuebrada.tabelas.semana[0].ciclo_id = 'inexistente';
    await expect(restaurarBackup(JSON.stringify(fkQuebrada))).rejects.toThrow();
    expect(await listarCiclos()).toHaveLength(1);
  });
});
