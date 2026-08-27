import { apiClient } from './api-client';
import { Prova, TipoProva } from '../types/api';

export function listarProvas(cicloId: string): Promise<Prova[]> {
  return apiClient.get<Prova[]>(`/ciclos/${cicloId}/provas`);
}

export interface DadosProva {
  nome: string;
  data: string;
  tipo?: TipoProva;
  distanciaKm?: number;
  metaTempoSegundos?: number;
}

export function criarProva(cicloId: string, dados: DadosProva): Promise<Prova> {
  return apiClient.post<Prova>(`/ciclos/${cicloId}/provas`, dados);
}

export function registrarResultadoProva(
  provaId: string,
  dados: { resultadoTempoSegundos: number; resultadoPace?: string },
): Promise<Prova> {
  return apiClient.patch<Prova>(`/provas/${provaId}/resultado`, dados);
}

export function excluirProva(provaId: string): Promise<void> {
  return apiClient.delete<void>(`/provas/${provaId}`);
}
