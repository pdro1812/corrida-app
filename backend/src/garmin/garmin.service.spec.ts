import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { GarminIndisponivelError } from './garmin.errors';
import { GarminService } from './garmin.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const spawnMock = spawn as jest.Mock;

type RespostaFake = {
  ok: boolean;
  data?: unknown;
  error?: string;
  novoTokenStore?: string;
};

// Fila compartilhada entre todos os processos fake criados no teste — cada
// escrita em stdin consome a próxima resposta enfileirada, simulando o
// protocolo linha-a-linha de garmin_client/session.py. Compartilhar a fila
// (em vez de amarrar respostas a uma instância de processo específica)
// também cobre o caso de reautenticação, onde um novo processo é spawnado.
let respostasEnfileiradas: RespostaFake[] = [];

function criarProcessoFake() {
  const processo = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: { write: jest.Mock };
    kill: jest.Mock;
  };
  processo.stdout = new PassThrough();
  processo.stderr = new PassThrough();
  processo.stdin = {
    write: jest.fn(() => {
      const resposta = respostasEnfileiradas.shift();
      if (resposta) {
        process.nextTick(() =>
          processo.stdout.write(JSON.stringify(resposta) + '\n'),
        );
      }
      return true;
    }),
  };
  processo.kill = jest.fn(() => processo.emit('exit'));
  return processo;
}

describe('GarminService', () => {
  let service: GarminService;
  let prismaMock: {
    garminSessao: { findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(() => {
    respostasEnfileiradas = [];
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => criarProcessoFake());
    prismaMock = {
      garminSessao: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    service = new GarminService(prismaMock as never);
  });

  function proximaResposta(resposta: RespostaFake) {
    respostasEnfileiradas.push(resposta);
  }

  it('spawna o processo Python uma vez e reaproveita a sessão nas chamadas seguintes', async () => {
    proximaResposta({ ok: true, data: [{ activityId: 1 }] });
    proximaResposta({ ok: true, data: [{ activityId: 1 }] });

    await service.buscarAtividadesRecentes();
    await service.buscarAtividadesRecentes();

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('encapsula falha em GarminIndisponivelError sem vazar o erro cru (RNF12)', async () => {
    proximaResposta({ ok: false, error: 'credenciais inválidas' });

    await expect(service.buscarAtividadesRecentes()).rejects.toThrow(
      GarminIndisponivelError,
    );
  });

  it('reautentica (spawna de novo) na próxima chamada após uma falha', async () => {
    proximaResposta({ ok: false, error: 'timeout' });
    await expect(service.buscarAtividadesRecentes()).rejects.toThrow(
      GarminIndisponivelError,
    );

    proximaResposta({ ok: true, data: [] });
    await service.buscarAtividadesRecentes();

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('retorna os lapDTOs da resposta de splits', async () => {
    proximaResposta({
      ok: true,
      data: { lapDTOs: [{ lapIndex: 1, intensityType: 'ACTIVE' }] },
    });

    const splits = await service.buscarSplitsDaAtividade(123);

    expect(splits).toEqual([{ lapIndex: 1, intensityType: 'ACTIVE' }]);
  });

  it('lê o token salvo e passa por env var ao spawnar o subprocesso', async () => {
    prismaMock.garminSessao.findUnique.mockResolvedValue({
      id: 1,
      tokenStore: 'token-salvo',
    });
    proximaResposta({ ok: true, data: [] });

    await service.buscarAtividadesRecentes();

    const opcoesDoSpawn = spawnMock.mock.calls[0][2] as {
      env: Record<string, string>;
    };
    expect(opcoesDoSpawn.env.GARMIN_TOKEN_STORE).toBe('token-salvo');
  });

  it('salva o novo token quando o subprocesso precisa de login completo', async () => {
    proximaResposta({ ok: true, data: [], novoTokenStore: 'token-novo' });

    await service.buscarAtividadesRecentes();

    expect(prismaMock.garminSessao.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, tokenStore: 'token-novo' },
      update: { tokenStore: 'token-novo' },
    });
  });

  it('falha ao buscar splits de uma atividade não invalida a sessão inteira', async () => {
    proximaResposta({ ok: false, error: 'atividade sem GPS' });

    const splits = await service.buscarSplitsDaAtividade(123);
    expect(splits).toEqual([]);

    // a sessão deve continuar viva — próxima chamada não precisa spawnar de novo
    proximaResposta({ ok: true, data: [] });
    await service.buscarAtividadesRecentes();

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
