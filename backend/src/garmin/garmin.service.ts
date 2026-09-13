import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface } from 'readline';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { GarminIndisponivelError } from './garmin.errors';
import { GarminAtividadeDTO, GarminLapDTO } from './garmin.types';
import { PrismaService } from '../prisma/prisma.service';

const ID_GARMIN_SESSAO = 1;

// Autenticação delegada a um subprocesso Python (garmin_client/session.py):
// as libs Node não-oficiais (garmin-connect, @gooin/garmin-connect) pararam
// de conseguir logar depois de uma mudança no fluxo do Garmin, enquanto a
// lib Python `garminconnect` (mantida ativamente) já foi corrigida — ver
// docs/ARCHITECTURE.md §3. O subprocesso fica vivo por sessão e reaproveita
// o login entre comandos, igual o client em cache que a lib npm tinha.
const CAMINHO_VENV_PYTHON = join(
  __dirname,
  '..',
  '..',
  '.venv',
  'bin',
  'python3',
);
const CAMINHO_SCRIPT_SESSAO = join(
  __dirname,
  '..',
  '..',
  'garmin_client',
  'session.py',
);

interface RespostaSessao {
  ok: boolean;
  data?: unknown;
  error?: string;
  // Presente só quando o subprocesso precisou fazer login completo
  // (usuário/senha) — ver GarminService.salvarTokenStore.
  novoTokenStore?: string;
}

interface RequisicaoPendente {
  resolve: (dado: unknown) => void;
  reject: (erro: Error) => void;
}

@Injectable()
export class GarminService {
  private readonly logger = new Logger(GarminService.name);
  private processo: ChildProcessWithoutNullStreams | null = null;
  private processoPromise: Promise<ChildProcessWithoutNullStreams> | null =
    null;
  private filaRespostas: RequisicaoPendente[] = [];

  constructor(private readonly prisma: PrismaService) {}

  // Async porque precisa ler o token cacheado (tabela garmin_sessao) antes
  // de spawnar — evita login completo repetido a cada restart, que é o que
  // aciona rate limit (429) no SSO do Garmin. `processoPromise` evita
  // spawnar dois processos em paralelo se duas chamadas chegarem antes do
  // primeiro spawn terminar.
  private getProcessoAutenticado(): Promise<ChildProcessWithoutNullStreams> {
    if (this.processo) {
      return Promise.resolve(this.processo);
    }
    if (!this.processoPromise) {
      this.processoPromise = this.criarProcesso();
    }
    return this.processoPromise;
  }

  private async criarProcesso(): Promise<ChildProcessWithoutNullStreams> {
    const tokenStoreSalvo = await this.buscarTokenStoreSalvo();

    const processo = spawn(CAMINHO_VENV_PYTHON, [CAMINHO_SCRIPT_SESSAO], {
      env: { ...process.env, GARMIN_TOKEN_STORE: tokenStoreSalvo ?? '' },
    });

    createInterface({ input: processo.stdout }).on('line', (linha) => {
      const pendente = this.filaRespostas.shift();
      if (!pendente) {
        return;
      }
      try {
        const resposta = JSON.parse(linha) as RespostaSessao;
        if (resposta.novoTokenStore) {
          this.salvarTokenStore(resposta.novoTokenStore);
        }
        if (resposta.ok) {
          pendente.resolve(resposta.data);
        } else {
          pendente.reject(
            new Error(resposta.error ?? 'falha desconhecida no Garmin'),
          );
        }
      } catch (erro) {
        pendente.reject(
          new Error(`resposta inválida do Python: ${String(erro)}`),
        );
      }
    });

    processo.stderr.on('data', (dado: Buffer) => {
      this.logger.warn(`garmin_client/session.py: ${dado.toString().trim()}`);
    });

    const encerrarComFalha = (erro: Error) => {
      if (this.processo === processo) {
        this.processo = null;
      }
      this.processoPromise = null;
      // Qualquer requisição ainda pendente nunca receberá resposta.
      while (this.filaRespostas.length > 0) {
        this.filaRespostas.shift()?.reject(erro);
      }
    };
    processo.on('error', encerrarComFalha);
    processo.on('exit', () =>
      encerrarComFalha(
        new Error('processo do Garmin encerrou antes de responder'),
      ),
    );

    this.processo = processo;
    this.processoPromise = null;
    return processo;
  }

  private async buscarTokenStoreSalvo(): Promise<string | null> {
    const sessao = await this.prisma.garminSessao.findUnique({
      where: { id: ID_GARMIN_SESSAO },
    });
    return sessao?.tokenStore ?? null;
  }

  // Chamado após login completo (ver RespostaSessao.novoTokenStore) para o
  // próximo restart do subprocesso reaproveitar a sessão em vez de logar
  // de novo. Fire-and-forget: uma falha ao salvar o cache não deve derrubar
  // a resposta do comando que já foi resolvida com sucesso.
  private salvarTokenStore(tokenStore: string): void {
    this.prisma.garminSessao
      .upsert({
        where: { id: ID_GARMIN_SESSAO },
        create: { id: ID_GARMIN_SESSAO, tokenStore },
        update: { tokenStore },
      })
      .catch((erro) => {
        this.logger.warn('Falha ao salvar cache de sessão do Garmin', erro);
      });
  }

  // Envio bruto de um comando à sessão Python — não mexe no estado da
  // sessão em caso de falha. Quem decide se um erro invalida a sessão
  // (e força relogin) é cada método público, não este helper.
  private async enviarComando<T>(comando: Record<string, unknown>): Promise<T> {
    const processo = await this.getProcessoAutenticado();
    return new Promise<T>((resolve, reject) => {
      this.filaRespostas.push({
        resolve: resolve as (dado: unknown) => void,
        reject,
      });
      processo.stdin.write(JSON.stringify(comando) + '\n');
    });
  }

  // Ponto único de entrada para chamadas que devem invalidar a sessão
  // inteira em caso de falha (RNF12): nunca deixa um erro não tratado
  // escapar para o resto do app.
  private async executar<T>(comando: Record<string, unknown>): Promise<T> {
    try {
      return await this.enviarComando<T>(comando);
    } catch (erro) {
      this.processo?.kill();
      this.processo = null; // força novo login na próxima tentativa
      this.processoPromise = null;
      this.logger.error('Falha ao comunicar com o Garmin Connect', erro);
      throw new GarminIndisponivelError(erro);
    }
  }

  async buscarAtividadesRecentes(limite = 20): Promise<GarminAtividadeDTO[]> {
    return this.executar({ cmd: 'activities', limit: limite });
  }

  // Falha ao buscar splits de UMA atividade específica não deve invalidar
  // a sessão inteira (pode ser só uma atividade sem laps/GPS) — loga e
  // retorna vazio em vez de propagar como GarminIndisponivelError.
  async buscarSplitsDaAtividade(activityId: number): Promise<GarminLapDTO[]> {
    try {
      const resposta = await this.enviarComando<{ lapDTOs?: GarminLapDTO[] }>({
        cmd: 'splits',
        activityId,
      });
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
