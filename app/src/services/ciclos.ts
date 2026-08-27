import { apiClient } from './api-client';
import { Ciclo, StatusCiclo } from '../types/api';

export function listarCiclos(status?: string): Promise<Ciclo[]> {
  return apiClient.get<Ciclo[]>(status ? `/ciclos?status=${status}` : '/ciclos');
}

export function buscarCicloAtivo(): Promise<Ciclo | null> {
  return listarCiclos('ativo').then((ciclos) => ciclos[0] ?? null);
}

export function buscarCiclo(id: string): Promise<Ciclo> {
  return apiClient.get<Ciclo>(`/ciclos/${id}`);
}

export interface DadosCiclo {
  nome: string;
  dataInicio: string;
  dataFim: string;
  provaNome?: string;
  provaData?: string;
  provaDistanciaKm?: number;
  provaMetaTempoSegundos?: number;
}

export function criarCiclo(dados: DadosCiclo): Promise<Ciclo> {
  return apiClient.post<Ciclo>('/ciclos', dados);
}

export function atualizarCiclo(
  id: string,
  dados: Partial<DadosCiclo> & { status?: StatusCiclo },
): Promise<Ciclo> {
  return apiClient.patch<Ciclo>(`/ciclos/${id}`, dados);
}

export function excluirCiclo(id: string): Promise<void> {
  return apiClient.delete<void>(`/ciclos/${id}`);
}
