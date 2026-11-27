import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { TreinoRealizado } from '../types/modelo';
import { buscarTreinoRealizado } from '../services/treinos';
import { formatarData, formatarKm } from '../utils/formato';
import { Screen } from '../components/Screen';
import { Banner } from '../components/Banner';
import { LoadingState } from '../components/LoadingState';
import { FormularioFeedback } from './TreinoDetalheScreen';
import { espacamento, tipografia } from '../theme/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'AvaliarTreino'>;

// v2: aberta pela notificação pós-sync (ou pelo aviso na Home) para
// registrar o RPE de um treino recém-importado.
export function AvaliarTreinoScreen({ route, navigation }: Props) {
  const [treino, setTreino] = useState<TreinoRealizado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      buscarTreinoRealizado(route.params.treinoRealizadoId)
        .then(setTreino)
        .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
    }, [route.params.treinoRealizadoId]),
  );

  if (erro) return <Screen><Banner tipo="erro" titulo="Treino não encontrado" mensagem={erro} /></Screen>;
  if (!treino) return <LoadingState />;

  return (
    <Screen scroll>
      <Text style={styles.titulo}>
        {formatarData(treino.data)} · {formatarKm(treino.distanciaKm)}
        {treino.paceMedio ? ` · ${treino.paceMedio}/km` : ''}
      </Text>
      <Text style={styles.ajuda}>
        0 = repouso · 3 = leve · 5 = moderado · 7 = difícil · 9 = quase no limite · 10 = máximo
      </Text>
      <FormularioFeedback
        titulo="Quanto custou esse treino?"
        treinoRealizadoId={treino.id}
        rpeInicial={treino.rpe}
        sensacoesIniciais={treino.sensacoes}
        textoInicial={treino.feedbackTexto}
        onSalvo={() => navigation.goBack()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titulo: { ...tipografia.subtitulo, marginBottom: espacamento.xs },
  ajuda: { ...tipografia.legenda, marginBottom: espacamento.md },
});
