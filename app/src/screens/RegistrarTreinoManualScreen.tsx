import { useState } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { registrarTreinoManual } from '../services/treinos';
import { espacamento } from '../theme/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'RegistrarTreinoManual'>;

export function RegistrarTreinoManualScreen({ route, navigation }: Props) {
  const { semanaId, treinoPrevistoId } = route.params;

  const [data, setData] = useState('');
  const [distanciaKm, setDistanciaKm] = useState('');
  const [duracaoMinutos, setDuracaoMinutos] = useState('');
  const [paceMedio, setPaceMedio] = useState('');
  const [fcMedia, setFcMedia] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!data.trim()) {
      setErro('Informe a data do treino');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await registrarTreinoManual({
        treinoPrevistoId,
        data,
        distanciaKm: distanciaKm.trim() ? Number(distanciaKm) : undefined,
        duracaoSegundos: duracaoMinutos.trim() ? Number(duracaoMinutos) * 60 : undefined,
        paceMedio: paceMedio.trim() || undefined,
        fcMedia: fcMedia.trim() ? Number(fcMedia) : undefined,
      });
      // Volta direto pra Semana (não pra Treino, que ficaria com dados
      // desatualizados — o objeto do treino veio como parâmetro estático).
      // A Semana recarrega sozinha ao ganhar foco (useFocusEffect).
      navigation.navigate('Semana', { semanaId });
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Tente novamente');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Screen scroll>
      {erro ? <Banner tipo="erro" titulo="Não foi possível registrar" mensagem={erro} onFechar={() => setErro(null)} /> : null}
      <TextField rotulo="Data (AAAA-MM-DD)" value={data} onChangeText={setData} placeholder="2026-08-20" />
      <TextField
        rotulo="Distância em km (opcional)"
        value={distanciaKm}
        onChangeText={setDistanciaKm}
        placeholder="8"
        keyboardType="numeric"
      />
      <TextField
        rotulo="Duração em minutos (opcional)"
        value={duracaoMinutos}
        onChangeText={setDuracaoMinutos}
        placeholder="45"
        keyboardType="numeric"
      />
      <TextField rotulo="Pace médio (opcional)" value={paceMedio} onChangeText={setPaceMedio} placeholder="5:20" />
      <TextField
        rotulo="FC média (opcional)"
        value={fcMedia}
        onChangeText={setFcMedia}
        placeholder="145"
        keyboardType="numeric"
      />
      <View style={{ marginTop: espacamento.sm }}>
        <Button titulo="Registrar treino" onPress={() => void salvar()} carregando={salvando} />
      </View>
    </Screen>
  );
}
