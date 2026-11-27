// Texto que vai para a área de transferência: o previsto do dia com o
// prefixo "P: ", para colar na descrição da atividade no Garmin.
export function textoPrevistoParaCopiar(descricao: string | null | undefined): string | null {
  const texto = (descricao ?? '').replace(/\s+/g, ' ').trim();
  return texto ? `P: ${texto}` : null;
}
