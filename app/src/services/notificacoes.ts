import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatarKm } from '../utils/formato';
import { TreinoSemRpe } from './rpe';

// v2: notificação local (nada passa por servidor) pedindo o RPE depois do
// sync. Tocar nela abre a tela de avaliação do treino.

const CANAL = 'rpe';

Notifications.setNotificationHandler({
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

export async function notificarRpePendente(treinos: TreinoSemRpe[]): Promise<void> {
  if (treinos.length === 0 || !(await permitido())) return;
  const [maisRecente] = treinos;
  const corpo =
    treinos.length === 1
      ? `Como foi o treino de ${formatarKm(maisRecente.distanciaKm)}? Toque para registrar o esforço (0 a 10).`
      : `${treinos.length} treinos esperando sua percepção de esforço (0 a 10).`;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Quanto custou?', body: corpo, data: { treinoRealizadoId: maisRecente.id } },
    trigger: Platform.OS === 'android' ? { channelId: CANAL } : null,
  });
}

// Chama `abrir` quando o usuário toca na notificação (inclusive se ela
// abriu o app). Devolve a função de limpeza do listener.
export function aoTocarNotificacaoRpe(abrir: (treinoRealizadoId: string) => void): () => void {
  const tratar = (resposta: Notifications.NotificationResponse | null) => {
    const id = resposta?.notification.request.content.data?.treinoRealizadoId;
    if (typeof id === 'string') abrir(id);
  };
  void Notifications.getLastNotificationResponseAsync().then(tratar);
  const assinatura = Notifications.addNotificationResponseReceivedListener(tratar);
  return () => assinatura.remove();
}
