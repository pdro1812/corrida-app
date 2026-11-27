import { describe, expect, it } from 'vitest';
import { textoPrevistoParaCopiar } from '../src/utils/textoPrevisto';
import { separarParaNotificar } from '../src/services/rpe';
import { excluirTreinoRealizado } from '../src/services/treinosRealizados';
import { gerarBackup } from '../src/services/backup';
import { criarBancoDeTeste } from './bancoDeTeste';

describe('copiar previsto', () => {
  it('prefixa com "P: " e junta linhas', () => {
    expect(textoPrevistoParaCopiar('  4x400m\n p/ 3:45 ')).toBe('P: 4x400m p/ 3:45');
    expect(textoPrevistoParaCopiar('')).toBeNull();
    expect(textoPrevistoParaCopiar(null)).toBeNull();
  });
});

describe('notificação de RPE por treino', () => {
  it('só avisa treinos novos e esquece os que já têm RPE', () => {
    const t = (id: string) => ({ id, data: '2026-11-20', distanciaKm: 8, tipo: null });
    expect(separarParaNotificar([t('a'), t('b')], ['a', 'velho'])).toEqual({ novos: [t('b')], notificados: ['a', 'b'] });
  });
});

describe('excluir treino do Garmin', () => {
  it('marca a atividade como ignorada para o sync não importar de novo', async () => {
    const banco = await criarBancoDeTeste();
    await banco.executar(
      "INSERT INTO treino_realizado (id, garmin_activity_id, fonte, data, distancia_km, criado_em) VALUES ('r', '999', 'garmin', '2026-11-20', 3, 'x')",
    );
    await excluirTreinoRealizado('r');
    expect(await banco.todos('SELECT garmin_activity_id, data FROM atividade_ignorada')).toEqual([
      { garmin_activity_id: '999', data: '2026-11-20' },
    ]);
    expect((await gerarBackup()).tabelas.atividade_ignorada).toHaveLength(1);
  });
});
