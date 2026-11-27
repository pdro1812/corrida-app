import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatarKm } from '../utils/formato';
import { gravarRpeNotificados, lerRpeNotificados, separarParaNotificar, TreinoSemRpe } from './rpe';

// v2: notificação local (nada passa por servidor) pedindo o RPE depois do
// sync. Tocar nela abre a tela de avaliação do treino.

const CANAL = 'rpe';

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function permitido(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Avaliar treino (RPE)',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

const idNotificacao = (treinoRealizadoId: string) => `rpe-${treinoRealizadoId}`;

function textoDoTreino(t: TreinoSemRpe): string {
  const [ano, mes, dia] = t.data.split('-').map(Number);
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' });
  const tipo = t.tipo ? ` · ${t.tipo.charAt(0).toUpperCase()}${t.tipo.slice(1)}` : '';
  return `${semana.replace('.', '')} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}${tipo} · ${formatarKm(t.distanciaKm)}`;
}

// Uma notificação por treino sem RPE, só para os que ainda não foram
// avisados. Tocar abre a avaliação daquele treino.
export async function notificarRpePendente(treinos: TreinoSemRpe[]): Promise<void> {
  if (Platform.OS === 'web') return;
  const { novos, notificados } = separarParaNotificar(treinos, await lerRpeNotificados());
  if (novos.length > 0 && (await permitido())) {
    for (const treino of novos) {
      await Notifications.scheduleNotificationAsync({
        identifier: idNotificacao(treino.id),
        content: {
          title: 'Quanto custou?',
          body: `${textoDoTreino(treino)}. Toque para registrar o esforço (0 a 10).`,
          data: { treinoRealizadoId: treino.id },
        },
        trigger: Platform.OS === 'android' ? { channelId: CANAL } : null,
      });
    }
  }
  await gravarRpeNotificados(notificados);
}

// Depois de registrar o RPE, tira a notificação daquele treino da bandeja.
export async function dispensarNotificacaoRpe(treinoRealizadoId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.dismissNotificationAsync(idNotificacao(treinoRealizadoId)).catch(() => undefined);
}

// Chama `abrir` quando o usuário toca na notificação (inclusive se ela
// abriu o app). Devolve a função de limpeza do listener.
export function aoTocarNotificacaoRpe(abrir: (treinoRealizadoId: string) => void): () => void {
  if (Platform.OS === 'web') return () => undefined; // navegador: só para testar telas
  const tratar = (resposta: Notifications.NotificationResponse | null) => {
    const id = resposta?.notification.request.content.data?.treinoRealizadoId;
    if (typeof id === 'string') abrir(id);
  };
  void Notifications.getLastNotificationResponseAsync().then(tratar);
  const assinatura = Notifications.addNotificationResponseReceivedListener(tratar);
  return () => assinatura.remove();
}
