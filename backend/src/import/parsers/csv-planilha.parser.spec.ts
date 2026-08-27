import { parsePlanilhaCsv } from './csv-planilha.parser';

const CSV_VALIDO = `semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
1,2026-07-07,terca,1. Base (Adaptação),rodagem,45 min Leve,,5:15,5:30
1,2026-07-09,quinta,1. Base (Adaptação),qualidade,"2km Leve + 6x 1km (90s trote) + 1km Leve",,4:15,4:20
1,2026-07-12,domingo,1. Base (Adaptação),longo,13km Leve,13,5:10,5:25`;

describe('parsePlanilhaCsv', () => {
  it('parses all rows of a well-formed CSV', () => {
    const { linhas, erros } = parsePlanilhaCsv(CSV_VALIDO);

    expect(erros).toHaveLength(0);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({
      semana: 1,
      diaSemana: 'terca',
      tipo: 'rodagem',
      descricao: '45 min Leve',
      distanciaAlvoKm: undefined,
      paceAlvoMin: '5:15',
      paceAlvoMax: '5:30',
    });
    expect(linhas[2]).toMatchObject({
      distanciaAlvoKm: 13,
    });
  });

  it('collects an error for an invalid semana without aborting the rest', () => {
    const csv = `semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
abc,2026-07-07,terca,,rodagem,45 min Leve,,5:15,5:30
1,2026-07-09,quinta,,longo,13km Leve,13,5:10,5:25`;

    const { linhas, erros } = parsePlanilhaCsv(csv);

    expect(linhas).toHaveLength(1);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatchObject({ linha: 2 });
  });

  it('collects an error for an invalid data', () => {
    const csv = `semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
1,not-a-date,terca,,rodagem,45 min Leve,,5:15,5:30`;

    const { erros } = parsePlanilhaCsv(csv);

    expect(erros).toHaveLength(1);
    expect(erros[0].motivo).toMatch(/data/i);
  });

  it('collects an error when descricao is missing', () => {
    const csv = `semana,data,dia_semana,fase,tipo,descricao,distancia_alvo_km,pace_alvo_min,pace_alvo_max
1,2026-07-07,terca,,rodagem,,,5:15,5:30`;

    const { erros } = parsePlanilhaCsv(csv);

    expect(erros).toHaveLength(1);
    expect(erros[0].motivo).toMatch(/descricao/i);
  });
});
