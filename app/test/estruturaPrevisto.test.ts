import { describe, expect, it } from 'vitest';
import { AmostraCompleta, analisarAtividade, AnaliseTreino } from '../src/dominio/blocosFit';
import { dividirPeloPrevisto, parseEstruturaPrevisto } from '../src/dominio/estruturaPrevisto';
import { gravarAnalise, treinosSemMetricas } from '../src/services/metricas';
import { criarBancoDeTeste } from './bancoDeTeste';
import { trecho } from './fixtures';

// Treino sem voltas marcadas: trechos seguidos de velocidade constante.
function corrida(trechos: [segundos: number, vel: number, fc: number][]): AmostraCompleta[] {
  const amostras: AmostraCompleta[] = [];
  let t = 0;
  let d = 0;
  for (const [segundos, vel, fc] of trechos) {
    amostras.push(...trecho(t, segundos, vel, () => fc, d));
    t += segundos;
    d += vel * segundos;
  }
  return amostras;
}

describe('estrutura do previsto', () => {
  it('lê aquecimento, contínuo, séries com trote e volta', () => {
    expect(parseEstruturaPrevisto('3 km aq + 30 min contínuo (4:15 a 4:20) + 3 km volta')).toEqual([
      { tipo: 'aq', metros: 3000 },
      { tipo: 'continuo', segundos: 1800, paceAlvoS: [255, 260] },
      { tipo: 'des', metros: 3000 },
    ]);
    expect(parseEstruturaPrevisto('3 km aq + 2x12 min (4:15 a 4:20) c/ 3 min trote + 3 km volta')).toEqual([
      { tipo: 'aq', metros: 3000 },
      { tipo: 'tiro', segundos: 720, paceAlvoS: [255, 260] },
      { tipo: 'trote', segundos: 180 },
      { tipo: 'tiro', segundos: 720, paceAlvoS: [255, 260] },
      { tipo: 'des', metros: 3000 },
    ]);
    expect(parseEstruturaPrevisto('2 km aquecimento + 6x400m c/ 200m trote + 2 km desaq')?.map((s) => s.tipo)).toEqual([
      'aq', 'tiro', 'trote', 'tiro', 'trote', 'tiro', 'trote', 'tiro', 'trote', 'tiro', 'trote', 'tiro', 'des',
    ]);
    // Sem estrutura (rodagem) ou sem medida: não divide.
    expect(parseEstruturaPrevisto('10 km leve')).toBeNull();
    expect(parseEstruturaPrevisto('Rodagem + educativos')).toBeNull();
    expect(parseEstruturaPrevisto(null)).toBeNull();
  });

  it('divide pela mudança de ritmo perto do ponto previsto', () => {
    // Aqueceu 3,2 km em vez de 3 (a fronteira segue a aceleração real).
    const amostras = corrida([
      [1067, 3, 140],
      [1800, 3.9, 165],
      [1000, 3, 145],
    ]);
    const janelas = dividirPeloPrevisto(amostras, parseEstruturaPrevisto('3 km aq + 30 min contínuo + 3 km volta') ?? []);
    expect(janelas?.map((j) => j.tipo)).toEqual(['aq', 'continuo', 'des']);
    expect(Math.abs((janelas?.[0].fim ?? 0) - 1067)).toBeLessThanOrEqual(5);
    expect(Math.abs((janelas?.[1].fim ?? 0) - 2867)).toBeLessThanOrEqual(5);
    // Atividade curta demais para a estrutura: fica sem divisão.
    expect(dividirPeloPrevisto(corrida([[600, 3, 140]]), parseEstruturaPrevisto('3 km aq + 30 min contínuo + 3 km volta') ?? [])).toBeNull();
  });

  it('a análise usa o previsto quando o relógio só tem auto-lap', () => {
    const amostras = corrida([
      [1000, 3, 140],
      [720, 3.9, 168],
      [180, 2.8, 150],
      [720, 3.9, 170],
      [1000, 3, 145],
    ]);
    const estrutura = parseEstruturaPrevisto('3 km aq + 2x12 min (4:15 a 4:20) c/ 3 min trote + 3 km volta');
    const a = analisarAtividade(amostras, [], estrutura) as AnaliseTreino;
    expect(a.divisao).toBe('previsto');
    expect(a.blocos.map((b) => b.tipo)).toEqual(['aq', 'tiro', 'trote', 'tiro', 'des']);
    expect(a.blocos[1].min).toBeCloseTo(12, 0);
    // Sem previsto: um contínuo só, como antes.
    const semPrevisto = analisarAtividade(amostras, []) as AnaliseTreino;
    expect(semPrevisto.divisao).toBe('nenhuma');
    expect(semPrevisto.blocos).toHaveLength(1);
  });

  it('refaz a análise quando o vínculo com o previsto muda', async () => {
    const banco = await criarBancoDeTeste();
    await banco.executar("INSERT INTO ciclo (id, nome, data_inicio, data_fim, status, criado_em) VALUES ('c', 'C', '2026-11-01', '2026-12-31', 'ativo', 'x')");
    await banco.executar("INSERT INTO semana (id, ciclo_id, numero_semana, data_inicio, data_fim) VALUES ('s', 'c', 1, '2026-11-16', '2026-11-22')");
    await banco.executar(
      "INSERT INTO treino_previsto (id, semana_id, dia_semana, data, descricao) VALUES ('p1', 's', 'qui', '2026-11-19', '3 km aq + 30 min contínuo + 3 km volta')",
    );
    await banco.executar(
      "INSERT INTO treino_realizado (id, garmin_activity_id, data, criado_em) VALUES ('r1', '123', '2026-11-19', 'x')",
    );
    await banco.executar("INSERT INTO treino_metricas (treino_realizado_id) VALUES ('r1')");
    const analise = analisarAtividade(corrida([[600, 3, 140]]), []) as AnaliseTreino;
    await gravarAnalise(banco, 'r1', { ...analise, previstoId: null });
    expect(await treinosSemMetricas(banco, 10)).toEqual([]);

    await banco.executar("UPDATE treino_realizado SET treino_previsto_id = 'p1' WHERE id = 'r1'");
    expect(await treinosSemMetricas(banco, 10)).toEqual([
      { id: 'r1', garmin_activity_id: '123', treino_previsto_id: 'p1', descricao_prevista: '3 km aq + 30 min contínuo + 3 km volta' },
    ]);
    await gravarAnalise(banco, 'r1', { ...analise, previstoId: 'p1' });
    expect(await treinosSemMetricas(banco, 10)).toEqual([]);
  });
});
