import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { GarminIndisponivelError } from '../garmin/garmin.errors';
import { GarminService } from '../garmin/garmin.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ehAtividadeDeCorrida,
  mapearAtividadeParaTreinoRealizado,
  mapearSplitsParaIntervalos,
} from './garmin-activity.mapper';

export interface ResultadoSincronizacao {
  ok: boolean;
  atividadesEncontradas: number;
  atividadesImportadas: number;
  atividadesJaExistentes: number;
  treinosCasadosComPrevisto: number;
  erro?: string;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

const NOME_JOB_SYNC_GARMIN = 'garmin-sync';
const CRON_PADRAO = '0 7 * * *';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly garminService: GarminService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
  ) {}

  // Cron dinâmico (RF10) — lido do ConfigService em runtime, em vez de
  // fixo em um decorator @Cron(), para respeitar GARMIN_SYNC_CRON do .env.
  onModuleInit() {
    const expressao =
      this.configService.get<string>('GARMIN_SYNC_CRON') ?? CRON_PADRAO;
    const job = new CronJob(expressao, () => {
      void this.sincronizarGarmin();
    });
    this.schedulerRegistry.addCronJob(NOME_JOB_SYNC_GARMIN, job);
    job.start();
    this.logger.log(
      `Sincronização automática do Garmin agendada: "${expressao}"`,
    );
  }

  // Ponto único de sincronização, chamado tanto pelo cron (RF10) quanto
  // pelo disparo manual (RF11). RNF12: nunca propaga erro do Garmin
  // como exceção não tratada — sempre retorna um resultado.
  //
  // Importa atividade + splits (RF12, RF13) com idempotência por
  // garmin_activity_id (RF14) e tenta casar com o previsto (RF15).
  async sincronizarGarmin(): Promise<ResultadoSincronizacao> {
    try {
      const atividades = await this.garminService.buscarAtividadesRecentes();
      const atividadesDeCorrida = atividades.filter(ehAtividadeDeCorrida);

      let atividadesImportadas = 0;
      let atividadesJaExistentes = 0;

      for (const atividade of atividadesDeCorrida) {
        const garminActivityId = String(atividade.activityId);
        const jaExiste = await this.prisma.treinoRealizado.findUnique({
          where: { garminActivityId },
        });
        if (jaExiste) {
          atividadesJaExistentes++;
          continue;
        }

        const intervalos =
          (atividade.lapCount ?? 0) > 1
            ? mapearSplitsParaIntervalos(
                await this.garminService.buscarSplitsDaAtividade(
                  atividade.activityId,
                ),
              )
            : [];

        await this.prisma.treinoRealizado.create({
          data: {
            ...mapearAtividadeParaTreinoRealizado(atividade),
            intervalos: intervalos.length ? { create: intervalos } : undefined,
          },
        });
        atividadesImportadas++;
      }

      // Roda sobre TODO treino_realizado ainda sem vínculo — não só os
      // recém-importados nesta chamada — porque é comum importar o plano
      // (CSV) depois de já ter sincronizado atividades do Garmin.
      const treinosCasadosComPrevisto = await this.casarPendentesComPrevisto();

      this.logger.log(
        `Sincronização Garmin concluída: ${atividadesImportadas} nova(s), ${atividadesJaExistentes} já existente(s), ${treinosCasadosComPrevisto} casada(s) com previsto`,
      );
      return {
        ok: true,
        atividadesEncontradas: atividades.length,
        atividadesImportadas,
        atividadesJaExistentes,
        treinosCasadosComPrevisto,
      };
    } catch (erro) {
      const mensagem =
        erro instanceof GarminIndisponivelError
          ? erro.message
          : 'Erro inesperado na sincronização com o Garmin';
      this.logger.error(
        mensagem,
        erro instanceof Error ? erro.stack : undefined,
      );
      return {
        ok: false,
        atividadesEncontradas: 0,
        atividadesImportadas: 0,
        atividadesJaExistentes: 0,
        treinosCasadosComPrevisto: 0,
        erro: mensagem,
      };
    }
  }

  // RF15: casa treino_realizado sem vínculo com o treino_previsto da
  // mesma data (± 1 dia) mais próximo. Um previsto pode acumular mais
  // de um realizado (ex: Garmin registrou o treino como duas atividades
  // separadas por esquecer de retomar) — nesse caso todos ficam
  // vinculados ao mesmo previsto e a agregação é feita em tempo de
  // consulta (ver docs/DATA_MODEL.md). O matching de intervalos por
  // repeticao_numero (segunda parte da RF15) também não grava nada
  // aqui — é feito quando o gráfico do RF22 for montado.
  private async casarPendentesComPrevisto(): Promise<number> {
    const pendentes = await this.prisma.treinoRealizado.findMany({
      where: { treinoPrevistoId: null },
    });

    let casados = 0;
    for (const treino of pendentes) {
      const conseguiu = await this.casarComPrevisto(treino.id, treino.data);
      if (conseguiu) {
        casados++;
      }
    }
    return casados;
  }

  private async casarComPrevisto(
    treinoRealizadoId: string,
    data: Date,
  ): Promise<boolean> {
    const candidatos = await this.prisma.treinoPrevisto.findMany({
      where: {
        data: {
          gte: new Date(data.getTime() - UM_DIA_MS),
          lte: new Date(data.getTime() + UM_DIA_MS),
        },
      },
    });

    if (candidatos.length === 0) {
      return false;
    }

    const maisProximo = candidatos.reduce((melhor, atual) =>
      Math.abs(atual.data.getTime() - data.getTime()) <
      Math.abs(melhor.data.getTime() - data.getTime())
        ? atual
        : melhor,
    );

    await this.prisma.$transaction([
      this.prisma.treinoRealizado.update({
        where: { id: treinoRealizadoId },
        data: { treinoPrevistoId: maisProximo.id },
      }),
      this.prisma.treinoPrevisto.update({
        where: { id: maisProximo.id },
        data: { status: 'realizado' },
      }),
    ]);
    return true;
  }
}
