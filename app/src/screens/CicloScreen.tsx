import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { AbasParamList, RootStackParamList } from '../types/navigation';
import { Ciclo, Semana } from '../types/modelo';
import { buscarCicloAtivo } from '../services/ciclos';
import { listarSemanasDoCiclo } from '../services/semanas';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { ListaSemanas } from '../components/ListaSemanas';
import { Segmentos } from '../components/Segmentos';
import { ProvasScreen } from './ProvasScreen';
import { BlocosDoCiclo } from '../components/BlocosDoCiclo';
import { cores, espacamento, tipografia } from '../theme/theme';

type Props = CompositeScreenProps<BottomTabScreenProps<AbasParamList, 'Ciclo'>, NativeStackScreenProps<RootStackParamList>>;
type Secao = 'semanas' | 'blocos' | 'provas';

// Aba Ciclo: tudo do planejamento. Semanas do ciclo ativo e calendário de
// provas, com atalhos para editar o ciclo, importar planilha e histórico.
export function CicloScreen({ navigation }: Props) {
  const [secao, setSecao] = useState<Secao>('semanas');
  return (
    <View style={styles.flex}>
      <Segmentos
        opcoes={[
          { valor: 'semanas', rotulo: 'Semanas' },
          { valor: 'blocos', rotulo: 'Blocos' },
          { valor: 'provas', rotulo: 'Provas' },
        ]}
        valor={secao}
        onChange={setSecao}
      />
      {secao === 'provas' ? <ProvasScreen /> : <SemanasDoCiclo navigation={navigation} secao={secao} />}
    </View>
  );
}

function SemanasDoCiclo({ navigation, secao }: { navigation: Props['navigation']; secao: 'semanas' | 'blocos' }) {
  const [carregando, setCarregando] = useState(true);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [semanas, setSemanas] = useState<Semana[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      void (async () => {
        const ativo = await buscarCicloAtivo();
        const lista = ativo ? await listarSemanasDoCiclo(ativo.id) : [];
        if (!cancelado) {
          setCiclo(ativo);
          setSemanas(lista);
          setCarregando(false);
        }
      })();
      return () => {
        cancelado = true;
      };
    }, []),
  );

  if (carregando) return <LoadingState />;

  const atalhos = (
    <View style={styles.atalhos}>
      <Pressable onPress={() => navigation.navigate('ImportarPlanilha')}>
        <Text style={styles.link}>Importar planilha</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('HistoricoCiclos')}>
        <Text style={styles.link}>Histórico de ciclos</Text>
      </Pressable>
    </View>
  );

  if (!ciclo) {
    return (
      <Screen scroll>
        <EmptyState emoji="🏃" titulo="Nenhum ciclo ativo" descricao="Crie um ciclo de preparação pra começar." />
        <Button titulo="Criar ciclo" onPress={() => navigation.navigate('CriarEditarCiclo', {})} />
        {atalhos}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Card style={styles.cabecalho}>
        <Pressable onPress={() => navigation.navigate('CriarEditarCiclo', { cicloId: ciclo.id })}>
          <Text style={tipografia.titulo}>{ciclo.nome}</Text>
          <Text style={tipografia.legenda}>Toque para editar o ciclo</Text>
        </Pressable>
      </Card>
      {secao === 'blocos' ? (
        <BlocosDoCiclo ciclo={ciclo} semanas={semanas} />
      ) : (
        <>
          {atalhos}
          <ListaSemanas semanas={semanas} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: cores.fundo },
  cabecalho: { marginBottom: espacamento.sm },
  atalhos: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: espacamento.md },
  link: { color: cores.primaria, fontWeight: '600', fontSize: 13 },
});
