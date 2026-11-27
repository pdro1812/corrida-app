import { HORARIOS_PADRAO, lerHorarios, precisaSincronizar } from '../dominio/agendaSync';
import { ResultadoSincronizacao } from '../types/modelo';
import { gravarConfiguracao, lerConfiguracao, obterChaveGarmin } from './configuracoes';
import { listarTreinosSemRpe } from './rpe';
import { sincronizarGarmin, ultimaSincronizacao } from './sync';

const CONFIG_HORARIOS = 'sync_horarios';
const CONFIG_SEGUNDO_PLANO = 'sync_segundo_plano';

export interface AgendaSync {
  horarios: string[];
  segundoPlano: boolean;
}

export async function lerAgendaSync(): Promise<AgendaSync> {
  let horarios = HORARIOS_PADRAO;
  try {
    const salvos = lerHorarios(await lerConfiguracao(CONFIG_HORARIOS));
    if (salvos.length) horarios = salvos;
  } catch {
    // valor antigo inválido: fica o padrão
  }
  return { horarios, segundoPlano: (await lerConfiguracao(CONFIG_SEGUNDO_PLANO)) !== '0' };
}

export async function salvarAgendaSync(texto: string, segundoPlano: boolean): Promise<AgendaSync> {
  const horarios = lerHorarios(texto);
  if (horarios.length === 0) throw new Error('Informe pelo menos um horário');
  await gravarConfiguracao(CONFIG_HORARIOS, horarios.join(','));
  await gravarConfiguracao(CONFIG_SEGUNDO_PLANO, segundoPlano ? '1' : '0');
  return { horarios, segundoPlano };
}

// Usado ao abrir o app e pela tarefa em segundo plano: sincroniza se já
// passou um horário agendado sem sync depois dele, e então avisa (uma
// notificação por treino) os treinos que ainda pedem o esforço.
export async function sincronizarSeAgendado(
  agora = new Date(),
  notificar?: (treinos: Awaited<ReturnType<typeof listarTreinosSemRpe>>) => Promise<void>,
): Promise<ResultadoSincronizacao | null> {
  if (!(await obterChaveGarmin())) return null;
  const { horarios } = await lerAgendaSync();
  if (!precisaSincronizar(agora, await ultimaSincronizacao(), horarios)) return null;
  const resultado = await sincronizarGarmin();
  if (resultado.ok && notificar) await notificar(await listarTreinosSemRpe());
  return resultado;
}
