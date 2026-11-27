import { describe, expect, it } from 'vitest';
import { textoPrevistoParaCopiar } from '../src/utils/textoPrevisto';
import { separarParaNotificar } from '../src/services/rpe';
import { excluirTreinoRealizado } from '../src/services/treinosRealizados';
import { gerarBackup } from '../src/services/backup';
import { criarProva, excluirProva, listarCalendarioProvas, listarProvasSemCiclo } from '../src/services/provas';
import { criarCiclo } from '../src/services/ciclos';
import { montarPerfil } from '../src/dominio/bancoAnalise';
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
