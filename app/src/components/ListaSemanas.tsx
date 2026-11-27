import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Semana } from '../types/modelo';
import { formatarData, formatarKm } from '../utils/formato';
import { agruparSemanasPorStatus, calcularKmRealizadoDaSemana, semanaEhAtual, semanaJaPassou } from '../utils/dashboard';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { cores, espacamento, tipografia } from '../theme/theme';

export function ListaSemanas({ semanas }: { semanas: Semana[] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (semanas.length === 0) {
    return (
      <>
        <Text style={styles.listaTitulo}>Semanas</Text>
        <EmptyState titulo="Nenhuma semana cadastrada ainda" emoji="📅" />
      </>
    );
  }

  const { emAndamento, concluidas } = agruparSemanasPorStatus(semanas);

  return (
    <>
      <Text style={styles.listaTitulo}>Semanas</Text>
      {emAndamento.map((semana) => (
        <Pressable
          key={semana.id}
          onPress={() => navigation.navigate('Semana', { semanaId: semana.id })}
        >
          <LinhaSemana semana={semana} />
        </Pressable>
      ))}

      {concluidas.length > 0 ? (
        <>
          <Text style={styles.listaTitulo}>Concluídas</Text>
          {concluidas.map((semana) => (
            <Pressable
              key={semana.id}
              onPress={() => navigation.navigate('Semana', { semanaId: semana.id })}
            >
              <LinhaSemana semana={semana} />
            </Pressable>
          ))}
        </>
      ) : null}
    </>
  );
}

export function LinhaSemana({ semana }: { semana: Semana }) {
  const passou = semanaJaPassou(semana);
  const atual = semanaEhAtual(semana);
  const kmRealizado = calcularKmRealizadoDaSemana(semana);

  return (
    <Card
      style={[
        styles.linha,
        passou && styles.linhaPassada,
        atual && styles.linhaAtual,
      ]}
    >
      <View style={styles.linhaConteudo}>
        <View style={styles.linhaEsquerda}>
          <View style={styles.linhaTitulo}>
            <Text style={tipografia.corpoForte}>Semana {semana.numeroSemana}</Text>
            <Text style={tipografia.legenda}>
              {' '}
              ({formatarData(semana.dataInicio)} - {formatarData(semana.dataFim)})
            </Text>
          </View>
          {semana.fase ? <Text style={tipografia.legenda}>{semana.fase}</Text> : null}
          {atual ? <Text style={styles.selo}>Semana atual</Text> : null}
        </View>
        <View style={styles.linhaDireita}>
          <Text style={tipografia.corpoForte}>{formatarKm(kmRealizado)}</Text>
          <Text style={tipografia.legenda}>de {formatarKm(semana.kmPlanejadoTotal)}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  listaTitulo: { ...tipografia.legendaForte, marginBottom: espacamento.sm },
  linha: { marginBottom: espacamento.sm },
  linhaPassada: { backgroundColor: cores.sucessoFundo, borderColor: cores.sucesso },
  linhaAtual: { borderColor: cores.primaria, borderWidth: 1.5 },
  linhaConteudo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  linhaEsquerda: { flex: 1, gap: espacamento.xs / 2 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  linhaDireita: { alignItems: 'flex-end' },
  selo: { ...tipografia.legendaForte, color: cores.primaria, marginTop: espacamento.xs / 2 },
});
