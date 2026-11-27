// SecureStore em memória para os testes.
const itens = new Map<string, string>();

export async function getItemAsync(chave: string): Promise<string | null> {
  return itens.get(chave) ?? null;
}

export async function setItemAsync(chave: string, valor: string): Promise<void> {
  itens.set(chave, valor);
}

export async function deleteItemAsync(chave: string): Promise<void> {
  itens.delete(chave);
}
