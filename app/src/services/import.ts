import { apiClient } from './api-client';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

export interface ResultadoImportacao {
  importacaoId: string;
  semanasCriadas: number;
  semanasReaproveitadas: number;
  treinosCriados: number;
  linhasComErro: { linha: number; motivo: string }[];
}

export interface Importacao {
  id: string;
  cicloId: string;
  nomeArquivo: string | null;
  semanasCriadas: number;
  treinosCriados: number;
  linhasComErro: number;
  criadoEm: string;
}

export function listarImportacoes(cicloId: string): Promise<Importacao[]> {
  return apiClient.get<Importacao[]>(`/ciclos/${cicloId}/importacoes`);
}

export function excluirImportacao(id: string): Promise<void> {
  return apiClient.delete<void>(`/importacoes/${id}`);
}

// Upload multipart não passa pelo apiClient genérico (Content-Type
// precisa ser definido pelo fetch a partir do boundary do FormData, não
// forçado como application/json).
export async function importarPlanilha(
  cicloId: string,
  formData: FormData,
): Promise<ResultadoImportacao> {
  if (!BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_URL não configurado (ver app/.env)');
  }

  const resposta = await fetch(`${BASE_URL}/ciclos/${cicloId}/import-planilha`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY ?? ''}` },
    body: formData,
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    const mensagem =
      (corpo && typeof corpo === 'object' && 'message' in corpo
        ? String((corpo as { message: unknown }).message)
        : undefined) ?? `Erro ${resposta.status} ao importar planilha`;
    throw new Error(mensagem);
  }

  return (await resposta.json()) as ResultadoImportacao;
}
