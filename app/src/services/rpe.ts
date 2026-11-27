import { obterBanco } from '../db/banco';
import { gravarConfiguracao, lerConfiguracao } from './configuracoes';
import { somarDias } from './linhas';

// v2: treinos recentes da Garmin ainda sem RPE — alimentam a notificação
// pós-sync e o aviso na Home. Só a última semana: depois disso a memória
// do esforço já não é confiável.
export interface TreinoSemRpe {
  id: string;
  data: string;
  distanciaKm: number | null;
  tipo: string | null; // tipo do previsto casado, se houver
}

export async function listarTreinosSemRpe(hoje = new Date().toISOString().slice(0, 10), dias = 7): Promise<TreinoSemRpe[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<{ id: string; data: string; distancia_km: number | null; tipo: string | null }>(
    `SELECT r.id, r.data, r.distancia_km, p.tipo FROM treino_realizado r
       LEFT JOIN treino_previsto p ON p.id = r.treino_previsto_id
      WHERE r.rpe IS NULL AND r.fonte = 'garmin' AND r.data >= ?
      ORDER BY r.data DESC, r.criado_em DESC`,
    [somarDias(hoje, -dias)],
  );
  return linhas.map((l) => ({ id: l.id, data: l.data, distanciaKm: l.distancia_km, tipo: l.tipo }));
}

// Uma notificação por treino: guarda quais já foram avisados para o
// próximo sync não repetir. A lista só mantém IDs ainda pendentes, então
// não cresce para sempre.
const CONFIG_NOTIFICADOS = 'rpe_notificados';

export function separarParaNotificar(pendentes: TreinoSemRpe[], jaNotificados: string[]) {
  const avisados = new Set(jaNotificados);
  return {
    novos: pendentes.filter((t) => !avisados.has(t.id)),
    notificados: pendentes.map((t) => t.id),
  };
}

export async function lerRpeNotificados(): Promise<string[]> {
  try {
    const valor = JSON.parse((await lerConfiguracao(CONFIG_NOTIFICADOS)) ?? '[]') as unknown;
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export async function gravarRpeNotificados(ids: string[]): Promise<void> {
  await gravarConfiguracao(CONFIG_NOTIFICADOS, JSON.stringify(ids));
}
