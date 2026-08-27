import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { TreinoPrevisto } from '../types/api';
import { buscarTreinoPrevisto } from '../services/treinos';
import { paceParaSegundos } from '../utils/comparacao';
import { montarComparacaoTiros, RepeticaoComparada } from '../utils/comparacaoTiro';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'TreinoTiro'>;

export function TreinoTiroScreen({ route }: Props) {
  const { treinoId } = route.params;
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [treino, setTreino] = useState<TreinoPrevisto | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelado = false;

      async function carregar() {
        setCarregando(true);
        setErro(null);
        try {
          const dados = await buscarTreinoPrevisto(treinoId);
          if (!cancelado) {
            setTreino(dados);
          }
        } catch (erroCapturado) {
          if (!cancelado) {
            setErro(
              erroCapturado instanceof Error
                ? erroCapturado.message
                : 'Erro ao carregar o treino',
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
    }, [treinoId]),
  );

  if (carregando) {
    return <LoadingState />;
  }

  if (erro || !treino) {
    return (
      <Screen>
        <EmptyState emoji="⚠️" titulo={erro ?? 'Treino não encontrado'} />
      </Screen>
    );
  }

  const tiros = montarComparacaoTiros(treino).filter((r) => r.tipo === 'tiro');
  const avaliadas = tiros.filter((r) => r.dentroDaMeta !== null);
  const dentroDaMeta = avaliadas.filter((r) => r.dentroDaMeta).length;

  return (
    <Screen scroll>
      <Text style={tipografia.titulo}>{treino.descricao}</Text>
      {tiros.length === 0 ? (
        <EmptyState emoji="🎯" titulo="Este treino não tem tiros estruturados" />
      ) : (
        <>
          <Text style={[tipografia.corpo, styles.resumo]}>
            {avaliadas.length > 0
              ? `${dentroDaMeta}/${avaliadas.length} tiros dentro da meta`
              : 'Sem dados de pace realizado suficientes pra avaliar os tiros'}
          </Text>
          <Card style={styles.graficoCard}>
            <Grafico repeticoes={tiros} />
            <View style={styles.legenda}>
              <LegendaItem cor={cores.neutro} rotulo="Previsto" />
              <LegendaItem cor={cores.primaria} rotulo="Realizado" />
            </View>
          </Card>
          <View style={styles.lista}>
            {tiros.map((r) => (
              <LinhaRepeticao key={r.numero} repeticao={r} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function LegendaItem({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <View style={styles.legendaItem}>
      <View style={[styles.legendaBolinha, { backgroundColor: cor }]} />
      <Text style={tipografia.legenda}>{rotulo}</Text>
    </View>
  );
}

function Grafico({ repeticoes }: { repeticoes: RepeticaoComparada[] }) {
  const todosPaces = repeticoes.flatMap((r) =>
    [
      r.previsto ? paceParaSegundos(r.previsto.paceAlvoMin) : null,
      r.previsto ? paceParaSegundos(r.previsto.paceAlvoMax) : null,
      r.realizado ? paceParaSegundos(r.realizado.paceMedio) : null,
    ].filter((v): v is number => v !== null),
  );
  if (todosPaces.length === 0) {
    return null;
  }
  const maxPace = Math.max(...todosPaces);
  const minPace = Math.min(...todosPaces);
  const faixa = Math.max(1, maxPace - minPace);

  // Barras invertidas: pace menor (mais rápido) = barra mais alta.
  function altura(segundos: number | null): number {
    if (segundos === null) {
      return 0;
    }
    return 20 + ((maxPace - segundos) / faixa) * 80;
  }

  return (
    <View style={styles.grafico}>
      {repeticoes.map((r) => {
        const previstoMedio = r.previsto
          ? mediaPace(r.previsto.paceAlvoMin, r.previsto.paceAlvoMax)
          : null;
        const realizadoSegundos = r.realizado ? paceParaSegundos(r.realizado.paceMedio) : null;
        return (
          <View key={r.numero} style={styles.graficoColuna}>
            <View style={styles.graficoBarras}>
              <View style={[styles.barra, styles.barraPrevisto, { height: altura(previstoMedio) }]} />
              <View
                style={[styles.barra, styles.barraRealizado, { height: altura(realizadoSegundos) }]}
              />
            </View>
            <Text style={tipografia.legenda}>{r.numero}</Text>
          </View>
        );
      })}
    </View>
  );
}

function mediaPace(min: string | null, max: string | null): number | null {
  const minSeg = paceParaSegundos(min);
  const maxSeg = paceParaSegundos(max);
  if (minSeg === null || maxSeg === null) {
    return minSeg ?? maxSeg;
  }
  return (minSeg + maxSeg) / 2;
}

function LinhaRepeticao({ repeticao }: { repeticao: RepeticaoComparada }) {
  const { previsto, realizado, dentroDaMeta, numero } = repeticao;
  const icone = dentroDaMeta === null ? '☑️' : dentroDaMeta ? '✅' : '⚠️';

  return (
    <Card style={styles.linha}>
      <Text style={tipografia.corpoForte}>
        {icone} Tiro {numero}
      </Text>
      <Text style={tipografia.legenda}>
        Previsto:{' '}
        {previsto
          ? `${previsto.distanciaAlvoKm ? `${previsto.distanciaAlvoKm} km` : '-'}${
              previsto.paceAlvoMin ? ` · ${previsto.paceAlvoMin}-${previsto.paceAlvoMax}/km` : ''
            }`
          : 'não planejado'}
      </Text>
      <Text style={tipografia.legenda}>
        Realizado:{' '}
        {realizado
          ? `${realizado.distanciaKm ? `${realizado.distanciaKm} km` : '-'}${
              realizado.paceMedio ? ` · ${realizado.paceMedio}/km` : ''
            }`
          : 'sem correspondência nos dados do Garmin'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  resumo: { marginTop: espacamento.xs, marginBottom: espacamento.md, color: cores.textoSecundario },
  graficoCard: { marginBottom: espacamento.md },
  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: espacamento.md,
  },
  graficoColuna: { alignItems: 'center' },
  graficoBarras: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 100 },
  barra: { width: 10, borderRadius: raio.sm - 5 },
  barraPrevisto: { backgroundColor: cores.neutro },
  barraRealizado: { backgroundColor: cores.primaria },
  legenda: { flexDirection: 'row', gap: espacamento.md, marginTop: espacamento.md },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: espacamento.xs },
  legendaBolinha: { width: 8, height: 8, borderRadius: 4 },
  lista: {},
  linha: { marginBottom: espacamento.sm },
});
