import { obterBanco } from '../db/banco';
import { somarDias } from './linhas';

// v2: treinos recentes da Garmin ainda sem RPE — alimentam a notificação
// pós-sync e o aviso na Home. Só a última semana: depois disso a memória
// do esforço já não é confiável.
export interface TreinoSemRpe {
  id: string;
  data: string;
  distanciaKm: number | null;
}

export async function listarTreinosSemRpe(hoje = new Date().toISOString().slice(0, 10), dias = 7): Promise<TreinoSemRpe[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<{ id: string; data: string; distancia_km: number | null }>(
    `SELECT id, data, distancia_km FROM treino_realizado
      WHERE rpe IS NULL AND fonte = 'garmin' AND data >= ?
      ORDER BY data DESC, criado_em DESC`,
    [somarDias(hoje, -dias)],
  );
  return linhas.map((l) => ({ id: l.id, data: l.data, distanciaKm: l.distancia_km }));
}
