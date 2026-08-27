import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TreinoRealizadoComPrevisto } from '../types/api';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { listarTreinosRealizados } from '../services/treinosRealizados';
import { calcularResumoRecente, corDoRpe } from '../utils/resumoTreinos';
import { rotuloSensacao } from '../utils/sensacoes';
import { formatarData, formatarDuracao, formatarKm } from '../utils/formato';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

// Diário de treinos: feed dos treinos realizados (Garmin + manual) com
// feedback subjetivo (RPE, sensações, relato) — RF18 não tinha nenhuma
// tela de consulta agregada até agora, só o formulário de registro.
export function DiarioTreinosScreen() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [treinos, setTreinos] = useState<TreinoRealizadoComPrevisto[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      setCarregando(true);
      listarTreinosRealizados()
        .then((resultado) => {
          if (!cancelado) setTreinos(resultado);
        })
        .catch((erroCapturado) => setErro(String(erroCapturado)))
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
      return () => {
        cancelado = true;
      };
    }, []),
  );

  if (carregando) {
    return <LoadingState />;
  }

  const resumo = calcularResumoRecente(treinos);

  return (
    <Screen>
      {erro ? <Banner tipo="erro" titulo="Erro ao carregar treinos" mensagem={erro} /> : null}
      <FlatList
        data={treinos}
        keyExtractor={(treino) => treino.id}
        ListHeaderComponent={
          treinos.length > 0 ? <ResumoRecenteCard resumo={resumo} /> : null
        }
        renderItem={({ item }) => <LinhaTreino treino={item} />}
        ListEmptyComponent={
          <EmptyState
            emoji="📝"
            titulo="Nenhum treino registrado ainda"
            descricao="Sincronize com o Garmin ou registre um treino manualmente pra ver o diário aqui."
          />
        }
      />
    </Screen>
  );
}

function ResumoRecenteCard({ resumo }: { resumo: ReturnType<typeof calcularResumoRecente> }) {
  return (
    <Card style={styles.resumoCard}>
      <Text style={tipografia.subtitulo}>Últimos {resumo.quantidade} treinos</Text>
      <View style={styles.resumoLinha}>
        <ResumoItem rotulo="Distância" valor={formatarKm(resumo.kmTotal)} />
        <ResumoItem
          rotulo="RPE médio"
          valor={resumo.rpeMedio !== null ? resumo.rpeMedio.toFixed(1) : '-'}
          cor={resumo.rpeMedio !== null ? corDoRpe(Math.round(resumo.rpeMedio)) : undefined}
        />
        <ResumoItem
          rotulo="Sensação comum"
          valor={resumo.sensacaoMaisComum ? rotuloSensacao(resumo.sensacaoMaisComum) : '-'}
        />
      </View>
    </Card>
  );
}

function ResumoItem({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <View style={styles.resumoItem}>
      <Text style={tipografia.legenda}>{rotulo}</Text>
      <Text style={[tipografia.corpoForte, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

function LinhaTreino({ treino }: { treino: TreinoRealizadoComPrevisto }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cabecalho}>
        <Text style={styles.data}>{formatarData(treino.data)}</Text>
        <View style={styles.badges}>
          {treino.rpe !== null ? (
            <View style={[styles.rpeBadge, { backgroundColor: corDoRpe(treino.rpe) }]}>
              <Text style={styles.rpeTexto}>RPE {treino.rpe}</Text>
            </View>
          ) : null}
          <Text style={styles.fonte}>{treino.fonte === 'garmin' ? '🛰️ Garmin' : '✍️ Manual'}</Text>
        </View>
      </View>

      <View style={styles.metricas}>
        <Text style={tipografia.corpoForte}>{formatarKm(treino.distanciaKm)}</Text>
        {treino.paceMedio ? <Text style={tipografia.legenda}>{treino.paceMedio}/km</Text> : null}
        {treino.duracaoSegundos ? (
          <Text style={tipografia.legenda}>{formatarDuracao(treino.duracaoSegundos)}</Text>
        ) : null}
      </View>

      {treino.treinoPrevisto ? (
        <Text style={[tipografia.legenda, styles.previsto]}>
          {treino.treinoPrevisto.diaSemana} · {treino.treinoPrevisto.descricao}
        </Text>
      ) : null}

      {treino.sensacoes.length > 0 ? (
        <View style={styles.chips}>
          {treino.sensacoes.map((sensacao) => (
            <Chip key={sensacao} rotulo={rotuloSensacao(sensacao)} selecionado={false} onPress={() => {}} />
          ))}
        </View>
      ) : null}

      {treino.feedbackTexto ? (
        <Text style={[tipografia.corpo, styles.feedback]}>&quot;{treino.feedbackTexto}&quot;</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  resumoCard: { marginBottom: espacamento.md },
  resumoLinha: { flexDirection: 'row', marginTop: espacamento.sm, gap: espacamento.lg },
  resumoItem: { gap: espacamento.xs / 2 },
  card: { marginBottom: espacamento.sm },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  data: { ...tipografia.corpoForte, textTransform: 'capitalize' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  rpeBadge: { borderRadius: raio.pill, paddingHorizontal: espacamento.sm, paddingVertical: espacamento.xs / 2 },
  rpeTexto: { fontSize: 12, fontWeight: '700', color: cores.textoClaro },
  fonte: { fontSize: 12, color: cores.textoSecundario },
  metricas: { flexDirection: 'row', gap: espacamento.md, marginTop: espacamento.sm, alignItems: 'baseline' },
  previsto: { marginTop: espacamento.xs, textTransform: 'capitalize' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.xs, marginTop: espacamento.sm },
  feedback: { marginTop: espacamento.sm, fontStyle: 'italic', color: cores.textoSecundario },
});
