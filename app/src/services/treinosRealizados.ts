import { apiClient } from './api-client';
import { TreinoPrevisto, TreinoRealizadoComPrevisto } from '../types/api';

export function listarTreinosRealizados(fonte?: string): Promise<TreinoRealizadoComPrevisto[]> {
  return apiClient.get<TreinoRealizadoComPrevisto[]>(
    fonte ? `/treinos-realizados?fonte=${fonte}` : '/treinos-realizados',
  );
}

export function excluirTreinoRealizado(id: string): Promise<void> {
  return apiClient.delete<void>(`/treinos-realizados/${id}`);
}

// Candidatos pra editar o vínculo (fix do casamento automático RF15) —
// treinos previstos de qualquer semana numa janela de dias em torno da
// data do realizado.
export function buscarCandidatosVinculo(
  data: string,
  janelaDias = 7,
): Promise<TreinoPrevisto[]> {
  return apiClient.get<TreinoPrevisto[]>(
    `/treinos/candidatos-vinculo?data=${encodeURIComponent(data)}&dias=${janelaDias}`,
  );
}

export function vincularTreinoRealizado(
  id: string,
  treinoPrevistoId: string | null,
): Promise<TreinoRealizadoComPrevisto> {
  return apiClient.patch<TreinoRealizadoComPrevisto>(`/treinos-realizados/${id}/vincular`, {
    treinoPrevistoId,
  });
}
