import { apiClient } from './api-client';
import { TreinoPrevisto, TreinoRealizado } from '../types/api';

export function buscarTreinoPrevisto(id: string): Promise<TreinoPrevisto> {
  return apiClient.get<TreinoPrevisto>(`/treinos/${id}`);
}

export function excluirTreino(id: string): Promise<void> {
  return apiClient.delete<void>(`/treinos/${id}`);
}

export function marcarNaoRealizado(
  id: string,
  motivoNaoRealizado: string,
): Promise<TreinoPrevisto> {
  return apiClient.patch<TreinoPrevisto>(`/treinos/${id}/nao-realizado`, {
    motivoNaoRealizado,
  });
}

export interface RegistrarFeedbackInput {
  rpe?: number;
  sensacoes?: string[];
  feedbackTexto?: string;
}

export function registrarFeedback(
  treinoRealizadoId: string,
  dados: RegistrarFeedbackInput,
): Promise<TreinoRealizado> {
  return apiClient.patch<TreinoRealizado>(
    `/treinos-realizados/${treinoRealizadoId}/feedback`,
    dados,
  );
}

export interface CriarTreinoRealizadoInput {
  treinoPrevistoId?: string;
  data: string;
  distanciaKm?: number;
  duracaoSegundos?: number;
  paceMedio?: string;
  fcMedia?: number;
  fcMax?: number;
  elevacaoM?: number;
  rpe?: number;
  sensacoes?: string[];
  feedbackTexto?: string;
  observacoes?: string;
}

export function registrarTreinoManual(
  dados: CriarTreinoRealizadoInput,
): Promise<TreinoRealizado> {
  return apiClient.post<TreinoRealizado>('/treinos-realizados', dados);
}
