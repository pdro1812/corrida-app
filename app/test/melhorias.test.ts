import { describe, expect, it } from 'vitest';
import { textoPrevistoParaCopiar } from '../src/utils/textoPrevisto';
import { separarParaNotificar } from '../src/services/rpe';
import { excluirTreinoRealizado } from '../src/services/treinosRealizados';
import { gerarBackup } from '../src/services/backup';
import { criarProva, excluirProva, listarCalendarioProvas, listarProvasSemCiclo } from '../src/services/provas';
import { criarCiclo } from '../src/services/ciclos';
import { montarPerfil } from '../src/dominio/bancoAnalise';
import { blocoDaData, blocosDasFases, gerarBlocosPadrao, posicaoNoBloco } from '../src/dominio/blocosCiclo';
import { criarBloco, gerarBlocosDoCiclo, listarBlocos } from '../src/services/blocosCiclo';
import { melhorTrecho } from '../src/dominio/melhorTrecho';
import { buscarCandidatosRecorde, criarRecorde } from '../src/services/recordes';
import { criarBancoDeTeste } from './bancoDeTeste';

describe('copiar previsto', () => {
  it('prefixa com "P: " e junta linhas', () => {
    expect(textoPrevistoParaCopiar('  4x400m\n p/ 3:45 ')).toBe('P: 4x400m p/ 3:45');
    expect(textoPrevistoParaCopiar('')).toBeNull();
    expect(textoPrevistoParaCopiar(null)).toBeNull();
  });
});

describe('notificação de RPE por treino', () => {
  it('só avisa treinos novos e esquece os que já têm RPE', () => {
    const t = (id: string) => ({ id, data: '2026-11-20', distanciaKm: 8, tipo: null });
    expect(separarParaNotificar([t('a'), t('b')], ['a', 'velho'])).toEqual({ novos: [t('b')], notificados: ['a', 'b'] });
  });
});

describe('excluir treino do Garmin', () => {
  it('marca a atividade como ignorada para o sync não importar de novo', async () => {
    const banco = await criarBancoDeTeste();
    await banco.executar(
      "INSERT INTO treino_realizado (id, garmin_activity_id, fonte, data, distancia_km, criado_em) VALUES ('r', '999', 'garmin', '2026-11-20', 3, 'x')",
    );
    await excluirTreinoRealizado('r');
    expect(await banco.todos('SELECT garmin_activity_id, data FROM atividade_ignorada')).toEqual([
      { garmin_activity_id: '999', data: '2026-11-20' },
    ]);
    expect((await gerarBackup()).tabelas.atividade_ignorada).toHaveLength(1);
  });
});

describe('calendário de provas', () => {
  it('aceita prova fora de ciclo e a usa como alvo de um ciclo novo', async () => {
    await criarBancoDeTeste();
    const nk = await criarProva(null, { nome: 'NK42k POA', data: '2027-08-22', tipo: 'alvo', distanciaKm: 42.2 });
    await criarProva(null, { nome: 'Rústica', data: '2027-07-01' });
    const ciclo = await criarCiclo({
      nome: 'Maratona POA',
      dataInicio: '2026-12-01',
      dataFim: '2027-06-06',
      provaNome: 'Maratona POA',
      provaData: '2027-06-06',
      provaDistanciaKm: 42.2,
    });
    expect((await listarProvasSemCiclo()).map((p) => p.nome)).toEqual(['Rústica', 'NK42k POA']);
    expect((await listarCalendarioProvas()).map((p) => [p.nome, p.cicloNome])).toEqual([
      ['Maratona POA', 'Maratona POA'],
      ['Rústica', null],
      ['NK42k POA', null],
    ]);

    const seguinte = await criarCiclo({
      nome: 'NK42k',
      dataInicio: '2027-06-20',
      dataFim: '2027-08-22',
      provaNome: 'NK42k POA',
      provaData: '2027-08-22',
      provaAlvoId: nk.id,
    });
    expect(seguinte.provas.map((p) => [p.id, p.tipo])).toEqual([[nk.id, 'alvo']]);
    expect(ciclo.provas).toHaveLength(1);
    await excluirProva((await listarProvasSemCiclo())[0].id); // avulsa pode ser excluída
    expect(await listarProvasSemCiclo()).toEqual([]);
  });

  it('perfil da análise mostra a relação das próximas provas com a alvo', () => {
    const prova = (nome: string, data: string, tipo: string, ciclo: string | null) => ({
      nome, data, tipo, ciclo, distanciaKm: 42.2, metaTempoSegundos: null, resultadoTempoSegundos: null, concluida: false,
    });
    const texto = montarPerfil({
      geradoEm: '2026-11-27T00:00:00Z',
      inicio: '2026-11-01',
      fim: '2026-11-27',
      atleta: { fcLimiar: null, paceLimiarS: null, provaAlvo: null },
      bemEstar: [],
      previstos: [],
      realizados: [],
      provas: [prova('Maratona POA', '2027-06-06', 'alvo', 'Ciclo POA'), prova('NK42k POA', '2027-08-22', 'alvo', null)],
      recordes: [],
      ciclos: [{ id: 'c', nome: 'Ciclo POA', dataInicio: '2026-10-01', dataFim: '2027-06-06', status: 'ativo' }],
      semanas: [],
      observacoes: null,
    });
    expect(texto).toContain('**Prova alvo:** Maratona POA');
    expect(texto).toContain('NK42k POA · 42.2 km (alvo de outro ciclo, 11 semana(s) depois da prova alvo)');
  });
});

describe('blocos do ciclo', () => {
  it('divisão padrão cobre o ciclo inteiro com o polimento no fim', () => {
    const blocos = gerarBlocosPadrao('2026-11-30', '2027-06-06');
    expect(blocos.map((b) => b.tipo)).toEqual(['base', 'desenvolvimento', 'especifico', 'polimento']);
    expect(blocos[0].dataInicio).toBe('2026-11-30');
    expect(blocos[3].dataFim).toBe('2027-06-06');
    for (let i = 1; i < blocos.length; i++) expect(blocos[i].dataInicio > blocos[i - 1].dataFim).toBe(true);
    expect(posicaoNoBloco(blocos[3], blocos[3].dataFim).total).toBe(3);
  });

  it('agrupa semanas seguidas com a mesma fase da planilha', () => {
    const s = (inicio: string, fim: string, fase: string | null) => ({ dataInicio: inicio, dataFim: fim, fase });
    expect(
      blocosDasFases([
        s('2026-12-07', '2026-12-13', 'Base'),
        s('2026-12-14', '2026-12-20', 'base'),
        s('2026-12-21', '2026-12-27', 'Específico'),
        s('2026-12-28', '2027-01-03', 'Taper'),
      ]),
    ).toEqual([
      { nome: 'Base', tipo: 'base', dataInicio: '2026-12-07', dataFim: '2026-12-20' },
      { nome: 'Específico', tipo: 'especifico', dataInicio: '2026-12-21', dataFim: '2026-12-27' },
      { nome: 'Taper', tipo: 'polimento', dataInicio: '2026-12-28', dataFim: '2027-01-03' },
    ]);
    expect(blocoDaData([{ dataInicio: '2026-12-07', dataFim: '2026-12-20' }], '2026-12-21')).toBeNull();
  });

  it('cria, valida e entra no backup', async () => {
    await criarBancoDeTeste();
    const ciclo = await criarCiclo({ nome: 'C', dataInicio: '2026-11-30', dataFim: '2027-06-06', provaNome: 'M', provaData: '2027-06-06' });
    expect(await gerarBlocosDoCiclo(ciclo.id, 'padrao')).toBe(4);
    await expect(criarBloco(ciclo.id, { nome: 'X', tipo: 'base', dataInicio: '2027-02-01', dataFim: '2027-01-01' })).rejects.toThrow('antes do início');
    expect((await listarBlocos(ciclo.id)).map((b) => b.ordem)).toEqual([1, 2, 3, 4]);
    expect((await gerarBackup()).tabelas.bloco_ciclo).toHaveLength(4);
  });
});

describe('importar recordes', () => {
  it('acha o trecho mais rápido de uma distância dentro da corrida', () => {
    // 3 km a 5:00/km e depois 2 km a 4:00/km (1 amostra por segundo)
    const amostras: { t: number; dist: number }[] = [];
    let dist = 0;
    for (let t = 0; t <= 1380; t++) {
      amostras.push({ t, dist });
      dist += t < 900 ? 1000 / 300 : 1000 / 240;
    }
    const r = melhorTrecho(amostras, 2000);
    expect(r?.segundos).toBeGreaterThanOrEqual(479);
    expect(r?.segundos).toBeLessThanOrEqual(481);
    expect(melhorTrecho(amostras, 10000)).toBeNull();
  });

  it('junta diário e Garmin, sem repetir, os mais rápidos primeiro', async () => {
    const banco = await criarBancoDeTeste();
    await banco.executar(
      "INSERT INTO treino_realizado (id, garmin_activity_id, fonte, data, distancia_km, duracao_segundos, criado_em) VALUES ('a', '1', 'garmin', '2026-09-10', 10.05, 2700, 'x'), ('b', '2', 'garmin', '2026-09-12', 5, 1500, 'x')",
    );
    const garmin = async () => [
      { activityId: 1, startTimeLocal: '2026-09-10 07:00:00', distance: 10050, duration: 2700 },
      { activityId: 3, startTimeLocal: '2026-09-20 07:00:00', distance: 21200, duration: 6300 },
    ];
    const { candidatos, erroGarmin } = await buscarCandidatosRecorde('2026-09-01', '2026-09-30', 10, garmin);
    expect(erroGarmin).toBeNull();
    expect(candidatos.map((c) => [c.garminActivityId, c.noApp, c.inteira])).toEqual([
      ['1', true, true],
      ['3', false, false],
    ]);
    const semGarmin = await buscarCandidatosRecorde('2026-09-01', '2026-09-30', 10, async () => {
      throw new Error('fora do ar');
    });
    expect(semGarmin).toMatchObject({ erroGarmin: 'fora do ar', candidatos: [{ garminActivityId: '1' }] });
    await criarRecorde({ distanciaKm: '10', tempo: '45:00', data: '2026-09-10', garminActivityId: '1' });
    expect((await gerarBackup()).tabelas.recorde_pessoal).toMatchObject([{ garmin_activity_id: '1' }]);
  });
});
