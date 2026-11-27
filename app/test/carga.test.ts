import { describe, expect, it } from 'vitest';
import { metricasDaSessao, MetricasFit } from '../src/dominio/metricasFit';
import { completarCarga, gravarMetricasFit } from '../src/services/metricas';
import { criarBancoDeTeste } from './bancoDeTeste';

const metricasVazias = Object.fromEntries(
  Object.keys(metricasDaSessao(undefined, [])).map((k) => [k, null]),
) as unknown as MetricasFit;

describe('carga de treino', () => {
  it('usa a carga da lista de atividades quando o FIT não traz, sem apagar depois', async () => {
    const banco = await criarBancoDeTeste();
    await banco.executar("INSERT INTO treino_realizado (id, garmin_activity_id, data, criado_em) VALUES ('r1', '111', '2026-11-19', 'x')");
    await gravarMetricasFit(banco, 'r1', metricasVazias);

    expect(await completarCarga(banco, [{ activityId: 111, activityTrainingLoad: 142.6 }, { activityId: 999, activityTrainingLoad: 80 }])).toBe(1);
    const carga = async () => (await banco.primeiro<{ c: number | null }>('SELECT carga_treino AS c FROM treino_metricas'))?.c;
    expect(await carga()).toBe(143);

    // Reprocessar o FIT (sem o campo) não apaga a carga.
    await gravarMetricasFit(banco, 'r1', { ...metricasVazias, cadenciaMediaPpm: 176 });
    expect(await carga()).toBe(143);
    // Já preenchida: não sobrescreve.
    expect(await completarCarga(banco, [{ activityId: 111, activityTrainingLoad: 50 }])).toBe(0);
  });
});
