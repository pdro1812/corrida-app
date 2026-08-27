import { apiClient } from './api-client';
import { ResultadoSincronizacao } from '../types/api';

export function sincronizarGarmin(): Promise<ResultadoSincronizacao> {
  return apiClient.post<ResultadoSincronizacao>('/sync/garmin');
}
