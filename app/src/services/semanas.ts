import { apiClient } from './api-client';
import { Semana } from '../types/api';

export function listarSemanasDoCiclo(cicloId: string): Promise<Semana[]> {
  return apiClient.get<Semana[]>(`/ciclos/${cicloId}/semanas`);
}

export function buscarSemana(id: string): Promise<Semana> {
  return apiClient.get<Semana>(`/semanas/${id}`);
}

export function excluirSemana(id: string): Promise<void> {
  return apiClient.delete<void>(`/semanas/${id}`);
}
