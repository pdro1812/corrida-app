import { Directory, File } from 'expo-file-system';
import { gerarBackup, nomeArquivoBackup, resumirBackup, ResumoBackup } from './backup';

// Entrada e saída de arquivos pelo seletor do sistema (Android SAF) — o
// app só acessa a pasta/arquivo que o usuário escolhe na hora.

export interface ArquivoTexto {
  nome: string;
  conteudo: string;
}

// Abre o seletor de arquivos e devolve o conteúdo como texto (null se
// cancelado).
export async function escolherArquivoTexto(mimeTypes: string[]): Promise<ArquivoTexto | null> {
  const escolha = await File.pickFileAsync({ mimeTypes });
  if (escolha.canceled) return null;
  return { nome: escolha.result.name, conteudo: await escolha.result.text() };
}

// Gera o backup e grava na pasta que o usuário escolher (ex: Downloads).
// Devolve null se o usuário cancelar a escolha da pasta.
// v2: grava o export para IA (Markdown) na pasta escolhida.
export async function salvarTextoNoCelular(nome: string, conteudo: string, mimeType = 'text/markdown'): Promise<boolean> {
  let pasta: Directory;
  try {
    pasta = await Directory.pickDirectoryAsync();
  } catch {
    return false; // seletor cancelado
  }
  pasta.createFile(nome, mimeType).write(conteudo);
  return true;
}

export async function salvarBackupNoCelular(): Promise<{ nome: string; resumo: ResumoBackup } | null> {
  let pasta: Directory;
  try {
    pasta = await Directory.pickDirectoryAsync();
  } catch {
    return null; // seletor cancelado
  }
  const backup = await gerarBackup();
  const nome = nomeArquivoBackup();
  pasta.createFile(nome, 'application/json').write(JSON.stringify(backup));
  return { nome, resumo: resumirBackup(backup) };
}
