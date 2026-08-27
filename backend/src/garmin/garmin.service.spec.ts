import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GarminIndisponivelError } from './garmin.errors';
import { GarminService } from './garmin.service';

const loginMock = jest.fn();
const getActivitiesMock = jest.fn();

jest.mock('garmin-connect', () => ({
  GarminConnect: jest.fn().mockImplementation(() => ({
    login: loginMock,
    getActivities: getActivitiesMock,
  })),
}));

describe('GarminService', () => {
  let service: GarminService;
  const configService = {
    getOrThrow: jest.fn((chave: string) => `valor-${chave}`),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GarminService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(GarminService);
  });

  it('logs in once and reuses the session on subsequent calls', async () => {
    loginMock.mockResolvedValue(undefined);
    getActivitiesMock.mockResolvedValue([{ activityId: 1 }]);

    await service.buscarAtividadesRecentes();
    await service.buscarAtividadesRecentes();

    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(getActivitiesMock).toHaveBeenCalledTimes(2);
  });

  it('wraps login failures in GarminIndisponivelError without leaking the raw error (RNF12)', async () => {
    loginMock.mockRejectedValue(new Error('credenciais inválidas'));

    await expect(service.buscarAtividadesRecentes()).rejects.toThrow(
      GarminIndisponivelError,
    );
  });

  it('re-authenticates on the next call after a failure', async () => {
    loginMock.mockRejectedValueOnce(new Error('timeout'));
    loginMock.mockResolvedValueOnce(undefined);
    getActivitiesMock.mockResolvedValue([]);

    await expect(service.buscarAtividadesRecentes()).rejects.toThrow(
      GarminIndisponivelError,
    );
    await service.buscarAtividadesRecentes();

    expect(loginMock).toHaveBeenCalledTimes(2);
  });
});
