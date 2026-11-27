import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { notificarRpePendente } from './notificacoes';
import { lerAgendaSync, sincronizarSeAgendado } from './syncAutomatico';

// Tarefa em segundo plano (WorkManager no Android). Roda mais ou menos de
// hora em hora; quem decide se sincroniza são os horários configurados.
// Precisa ser definida no carregamento do JS (index.ts), antes do App.
export const TAREFA_SYNC = 'corrida-sync-agendado';

if (Platform.OS !== 'web') {
  TaskManager.defineTask(TAREFA_SYNC, async () => {
    try {
      const resultado = await sincronizarSeAgendado(new Date(), notificarRpePendente);
      return resultado && !resultado.ok ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

// Liga ou desliga a tarefa conforme a configuração. Chamado ao abrir o app
// e ao salvar em Configurações.
export async function aplicarTarefaSync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { segundoPlano } = await lerAgendaSync();
  const registrada = await TaskManager.isTaskRegisteredAsync(TAREFA_SYNC);
  if (!segundoPlano) {
    if (registrada) await BackgroundTask.unregisterTaskAsync(TAREFA_SYNC);
    return false;
  }
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!registrada) await BackgroundTask.registerTaskAsync(TAREFA_SYNC, { minimumInterval: 60 });
  return true;
}
