import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GarminConnect } from 'garmin-connect';
import { IActivity } from 'garmin-connect/dist/garmin/types/activity';
import { GarminIndisponivelError } from './garmin.errors';
import { GarminLapDTO, GarminSplitsResponse } from './garmin.types';

// Endpoint não-documentado da API interna do Garmin Connect (mesmo padrão
// usado por outras libs não-oficiais). Não faz parte da API pública do
// pacote garmin-connect, que só expõe dados agregados por atividade.
function urlSplitsDaAtividade(activityId: number): string {
  return `https://connectapi.garmin.com/activity-service/activity/${activityId}/splits`;
}

@Injectable()
export class GarminService {
  private readonly logger = new Logger(GarminService.name);
  private client: GarminConnect | null = null;

  constructor(private readonly configService: ConfigService) {}

  private async getClienteAutenticado(): Promise<GarminConnect> {
    if (this.client) {
      return this.client;
    }

    const username = this.configService.getOrThrow<string>('GARMIN_EMAIL');
    const password = this.configService.getOrThrow<string>('GARMIN_PASSWORD');

    const client = new GarminConnect({ username, password });
    await client.login();
    this.client = client;
    return client;
  }

  // Ponto único de entrada para qualquer chamada ao Garmin Connect.
  // Isola falhas da lib não-oficial (RNF12): nunca deixa um erro
  // não tratado escapar para o resto do app.
  private async executar<T>(operacao: (client: GarminConnect) => Promise<T>) {
    try {
      const client = await this.getClienteAutenticado();
      return await operacao(client);
    } catch (erro) {
      this.client = null; // força novo login na próxima tentativa
      this.logger.error('Falha ao comunicar com o Garmin Connect', erro);
      throw new GarminIndisponivelError(erro);
    }
  }

  async buscarAtividadesRecentes(limite = 20): Promise<IActivity[]> {
    return this.executar((client) => client.getActivities(0, limite));
  }

  // Falha ao buscar splits de UMA atividade específica não deve invalidar
  // a sessão inteira (pode ser só uma atividade sem laps/GPS) — loga e
  // retorna vazio em vez de propagar como GarminIndisponivelError.
  async buscarSplitsDaAtividade(activityId: number): Promise<GarminLapDTO[]> {
    try {
      const client = await this.getClienteAutenticado();
      const resposta = await client.get<GarminSplitsResponse>(
        urlSplitsDaAtividade(activityId),
      );
      return resposta.lapDTOs ?? [];
    } catch (erro) {
      this.logger.warn(
        `Não foi possível buscar splits da atividade ${activityId}`,
        erro,
      );
      return [];
    }
  }
}
