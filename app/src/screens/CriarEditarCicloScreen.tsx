import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { LoadingState } from '../components/LoadingState';
import { atualizarCiclo, buscarCiclo, criarCiclo, excluirCiclo } from '../services/ciclos';
import { provaAlvoDoCiclo } from '../types/modelo';
import { formatarDuracao } from '../utils/formato';
import { espacamento, tipografia } from '../theme/theme';

function paraSegundos(hms: string): number | undefined {
  if (!hms.trim()) {
    return undefined;
  }
  const partes = hms.split(':').map(Number);
  if (partes.some(Number.isNaN) || partes.length < 2) {
    return undefined;
  }
  return partes.length === 3
    ? partes[0] * 3600 + partes[1] * 60 + partes[2]
    : partes[0] * 60 + partes[1];
}

type Props = NativeStackScreenProps<HomeStackParamList, 'CriarEditarCiclo'>;

export function CriarEditarCicloScreen({ route, navigation }: Props) {
  const cicloId = route.params?.cicloId;
  const editando = !!cicloId;

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [provaNome, setProvaNome] = useState('');
  const [provaData, setProvaData] = useState('');
  const [provaDistanciaKm, setProvaDistanciaKm] = useState('');
  const [provaMetaTempo, setProvaMetaTempo] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!cicloId) {
        return;
      }
      let cancelado = false;
      buscarCiclo(cicloId)
        .then((ciclo) => {
          if (cancelado) return;
          const provaAlvo = provaAlvoDoCiclo(ciclo);
          setNome(ciclo.nome);
          setDataInicio(ciclo.dataInicio.slice(0, 10));
          setDataFim(ciclo.dataFim.slice(0, 10));
          setProvaNome(provaAlvo?.nome ?? '');
          setProvaData(provaAlvo?.data.slice(0, 10) ?? '');
          setProvaDistanciaKm(provaAlvo?.distanciaKm ? String(provaAlvo.distanciaKm) : '');
          setProvaMetaTempo(
            provaAlvo?.metaTempoSegundos ? formatarDuracao(provaAlvo.metaTempoSegundos) : '',
          );
        })
        .catch((erroCapturado) => setErro(String(erroCapturado)))
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
      return () => {
        cancelado = true;
      };
    }, [cicloId]),
  );

  async function salvar() {
    if (!nome.trim() || !dataInicio.trim() || !dataFim.trim() || !provaNome.trim() || !provaData.trim()) {
      setErro('Preencha nome do ciclo, datas de início/fim e nome/data da prova alvo');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const dados = {
        nome: nome.trim(),
        dataInicio,
        dataFim,
        provaNome: provaNome.trim(),
        provaData,
        provaDistanciaKm: provaDistanciaKm.trim() ? Number(provaDistanciaKm) : undefined,
        provaMetaTempoSegundos: paraSegundos(provaMetaTempo),
      };
      if (editando) {
        await atualizarCiclo(cicloId, dados);
      } else {
        await criarCiclo(dados);
      }
      navigation.navigate('Home');
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Tente novamente');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir ciclo', 'Isso remove o ciclo e todas as semanas/treinos dele. Confirma?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          void excluirCiclo(cicloId!)
            .then(() => navigation.navigate('Home'))
            .catch((erroCapturado) => setErro(String(erroCapturado)));
        },
      },
    ]);
  }

  if (carregando) {
    return <LoadingState />;
  }

  return (
    <Screen scroll>
      {erro ? <Banner tipo="erro" titulo="Não foi possível salvar" mensagem={erro} onFechar={() => setErro(null)} /> : null}

      <TextField rotulo="Nome do ciclo" value={nome} onChangeText={setNome} placeholder="Meia Maratona - Set/2026" />
      <TextField
        rotulo="Data de início (AAAA-MM-DD)"
        value={dataInicio}
        onChangeText={setDataInicio}
        placeholder="2026-08-01"
      />
      <TextField
        rotulo="Data de fim (AAAA-MM-DD)"
        value={dataFim}
        onChangeText={setDataFim}
        placeholder="2026-11-15"
      />

      <Text style={styles.secao}>Prova alvo</Text>
      <TextField rotulo="Nome da prova" value={provaNome} onChangeText={setProvaNome} placeholder="Meia de Porto Alegre" />
      <TextField
        rotulo="Data da prova (AAAA-MM-DD)"
        value={provaData}
        onChangeText={setProvaData}
        placeholder="2026-11-15"
      />
      <TextField
        rotulo="Distância da prova em km (opcional)"
        value={provaDistanciaKm}
        onChangeText={setProvaDistanciaKm}
        placeholder="21.1"
        keyboardType="numeric"
      />
      <TextField
        rotulo="Meta de tempo (H:MM:SS, opcional)"
        value={provaMetaTempo}
        onChangeText={setProvaMetaTempo}
        placeholder="1:45:00"
      />

      <Button
        titulo={editando ? 'Salvar alterações' : 'Criar ciclo'}
        onPress={() => void salvar()}
        carregando={salvando}
      />

      {editando ? (
        <View style={{ marginTop: espacamento.md }}>
          <Button titulo="Excluir ciclo" variante="perigo" onPress={confirmarExclusao} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  secao: { ...tipografia.legendaForte, marginTop: espacamento.md, marginBottom: espacamento.sm },
});
