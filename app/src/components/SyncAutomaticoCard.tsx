import { useCallback, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from './Card';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { lerAgendaSync, salvarAgendaSync } from '../services/syncAutomatico';
import { aplicarTarefaSync } from '../services/tarefaSync';
import { espacamento, tipografia } from '../theme/theme';

type Aviso = { tipo: 'sucesso' | 'erro'; titulo: string; mensagem?: string };

// Horários do sync automático e o interruptor do segundo plano.
export function SyncAutomaticoCard({ onAviso }: { onAviso: (aviso: Aviso) => void }) {
  const [horarios, setHorarios] = useState('');
  const [segundoPlano, setSegundoPlano] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void lerAgendaSync().then((agenda) => {
        setHorarios(agenda.horarios.join(', '));
        setSegundoPlano(agenda.segundoPlano);
      });
    }, []),
  );

  async function salvar() {
    setSalvando(true);
    try {
      const agenda = await salvarAgendaSync(horarios, segundoPlano);
      setHorarios(agenda.horarios.join(', '));
      const ativa = await aplicarTarefaSync();
      onAviso({
        tipo: 'sucesso',
        titulo: 'Sincronização automática salva',
        mensagem: agenda.segundoPlano
          ? ativa
            ? `Em segundo plano, perto de ${agenda.horarios.join(' e ')}.`
            : 'O Android não liberou tarefas em segundo plano; o sync roda ao abrir o app.'
          : 'Só ao abrir o app, quando já tiver passado um dos horários.',
      });
    } catch (erro) {
      onAviso({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      setSalvando(false);
    }
  }

  async function abrirBateria() {
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {
      await Linking.openSettings();
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={tipografia.subtitulo}>Sincronização automática</Text>
      <Text style={[tipografia.legenda, styles.texto]}>
        Depois de cada horário, o app sincroniza com a Garmin e manda uma notificação por treino que precisa do esforço.
        O Android não garante o minuto exato: costuma rodar até ~1 hora depois. Abrir o app também sincroniza se um
        horário já passou.
      </Text>
      <TextField rotulo="Horários (HH:MM, separados por vírgula)" value={horarios} onChangeText={setHorarios} placeholder="08:00, 20:00" />
      <View style={styles.linha}>
        <Chip rotulo="Em segundo plano" selecionado={segundoPlano} onPress={() => setSegundoPlano(true)} />
        <Chip rotulo="Só ao abrir o app" selecionado={!segundoPlano} onPress={() => setSegundoPlano(false)} />
      </View>
      <View style={styles.linha}>
        <Button titulo="Salvar" onPress={() => void salvar()} carregando={salvando} />
        {Platform.OS === 'android' ? (
          <Button titulo="Liberar da economia de bateria" variante="secundaria" onPress={() => void abrirBateria()} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  texto: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginTop: espacamento.sm },
});
