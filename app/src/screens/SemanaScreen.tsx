import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { Semana, TreinoPrevisto } from '../types/modelo';
import { buscarSemana, excluirSemana } from '../services/semanas';
import { formatarDuracao, formatarKm, formatarData } from '../utils/formato';
import { agregarRealizados, calcularStatusComparacao, ICONE_STATUS } from '../utils/comparacao';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { TipoTreinoBadge } from '../components/TipoTreinoBadge';
import { cores, espacamento, tipoTreino, tipografia } from '../theme/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Semana'>;

export function SemanaScreen({ route, navigation }: Props) {
  const { semanaId } = route.params;
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semana, setSemana] = useState<Semana | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        setErro(null);
        try {
          const dados = await buscarSemana(semanaId);
          if (!cancelado) {
            setSemana(dados);
          }
        } catch (erroCapturado) {
          if (!cancelado) {
            setErro(
              erroCapturado instanceof Error
                ? erroCapturado.message
                : 'Erro ao carregar a semana',
            );
          }
        } finally {
          if (!cancelado) {
            setCarregando(false);
          }
        }
      }

      void carregar();
      return () => {
        cancelado = true;
      };
    }, [semanaId]),
  );

  function confirmarExclusao() {
    if (!semana) return;
    Alert.alert(
      'Excluir semana',
      `Isso remove a Semana ${semana.numeroSemana} e todos os treinos previstos dela. Confirma?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            setExcluindo(true);
            excluirSemana(semana.id)
              .then(() => navigation.goBack())
              .catch((erroCapturado) =>
                setErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)),
              )
              .finally(() => setExcluindo(false));
          },
        },
      ],
    );
  }

  if (carregando) {
    return <LoadingState />;
  }

  if (!semana) {
    return (
      <Screen>
        {erro ? <Banner tipo="erro" titulo="Erro ao carregar a semana" mensagem={erro} /> : null}
        <EmptyState emoji="⚠️" titulo="Semana não encontrada" />
      </Screen>
    );
  }

  return (
    <Screen>
      {erro ? <Banner tipo="erro" titulo="Não foi possível excluir" mensagem={erro} onFechar={() => setErro(null)} /> : null}
      <Card style={styles.cabecalho}>
        <Text style={tipografia.titulo}>Semana {semana.numeroSemana}</Text>
        {semana.fase ? <Text style={tipografia.legenda}>{semana.fase}</Text> : null}
        <Text style={[tipografia.corpoForte, styles.totais]}>
          {formatarKm(semana.kmPlanejadoTotal)} planejados ·{' '}
          {formatarDuracao(semana.tempoPlanejadoTotalSegundos)}
        </Text>
        <View style={styles.botaoExcluir}>
          <Button titulo="Excluir semana" variante="perigo" onPress={confirmarExclusao} carregando={excluindo} />
        </View>
      </Card>
      <FlatList
        data={semana.treinosPrevistos}
        keyExtractor={(treino) => treino.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('TreinoDetalhe', { treino: item })}>
            <LinhaTreino treino={item} />
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState emoji="📅" titulo="Nenhum treino cadastrado nesta semana" />
        }
      />
    </Screen>
  );
}

function LinhaTreino({ treino }: { treino: TreinoPrevisto }) {
  const status = calcularStatusComparacao(treino);
  const realizado = treino.realizados.length > 0 ? agregarRealizados(treino.realizados) : null;
  const corLateral = treino.tipo ? tipoTreino[treino.tipo].cor : cores.borda;

  return (
    <Card style={[styles.linha, { borderLeftWidth: 4, borderLeftColor: corLateral }]}>
      <View style={styles.linhaCabecalho}>
        <Text style={styles.linhaIcone}>{ICONE_STATUS[status]}</Text>
        <Text style={styles.linhaData}>
          {treino.diaSemana} · {formatarData(treino.data)}
        </Text>
      </View>
      <View style={styles.linhaBadge}>
        <TipoTreinoBadge tipo={treino.tipo} />
      </View>
      <Text style={[tipografia.corpo, styles.linhaDescricao]}>{treino.descricao}</Text>
      <Text style={tipografia.legenda}>
        Previsto: {formatarKm(treino.distanciaAlvoKm)}
        {treino.paceAlvoMin ? ` · ${treino.paceAlvoMin}-${treino.paceAlvoMax}/km` : ''}
      </Text>
      {realizado ? (
        <Text style={tipografia.legenda}>
          Realizado: {formatarKm(realizado.distanciaKm)}
          {realizado.paceMedio ? ` · ${realizado.paceMedio}/km` : ''}
        </Text>
      ) : null}
      {treino.status === 'nao_realizado' && treino.motivoNaoRealizado ? (
        <Text style={[tipografia.legenda, styles.linhaMotivo]}>
          Motivo: {treino.motivoNaoRealizado}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cabecalho: { marginBottom: espacamento.md },
  totais: { marginTop: espacamento.sm },
  botaoExcluir: { marginTop: espacamento.md },
  linha: { marginBottom: espacamento.sm },
  linhaCabecalho: { flexDirection: 'row', alignItems: 'center', gap: espacamento.xs + 2 },
  linhaIcone: { fontSize: 16 },
  linhaData: { ...tipografia.corpoForte, textTransform: 'capitalize' },
  linhaBadge: { marginTop: espacamento.xs + 2 },
  linhaDescricao: { marginTop: espacamento.xs, marginBottom: espacamento.xs },
  linhaMotivo: { color: cores.erro },
});
