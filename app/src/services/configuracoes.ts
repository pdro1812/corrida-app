import * as SecureStore from 'expo-secure-store';
import { obterBanco } from '../db/banco';

// A chave da Garmin Personal API fica no SecureStore (criptografada pelo
// Android Keystore) — nunca no SQLite, no backup ou no código.
const CHAVE_GARMIN = 'garmin_api_key';

export function obterChaveGarmin(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE_GARMIN);
}

export async function salvarChaveGarmin(chave: string): Promise<void> {
  const limpa = chave.trim();
  if (!limpa) throw new Error('Informe a chave da Garmin');
  await SecureStore.setItemAsync(CHAVE_GARMIN, limpa);
}

export function removerChaveGarmin(): Promise<void> {
  return SecureStore.deleteItemAsync(CHAVE_GARMIN);
}

// Preferências simples (não sensíveis) do app.
export async function lerConfiguracao(chave: string): Promise<string | null> {
  const banco = await obterBanco();
  const linha = await banco.primeiro<{ valor: string }>('SELECT valor FROM configuracao WHERE chave = ?', [chave]);
  return linha?.valor ?? null;
}

export async function gravarConfiguracao(chave: string, valor: string): Promise<void> {
  const banco = await obterBanco();
  await banco.executar(
    'INSERT INTO configuracao (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    [chave, valor],
  );
}
