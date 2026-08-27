// Erro dedicado para falhas da lib não-oficial garmin-connect (RNF12):
// quem consome este serviço deve capturar este erro e seguir operando
// normalmente — a sincronização Garmin nunca pode derrubar o resto do app.
export class GarminIndisponivelError extends Error {
  constructor(causa: unknown) {
    super('Garmin Connect indisponível ou credenciais inválidas');
    this.name = 'GarminIndisponivelError';
    this.cause = causa;
  }
}
