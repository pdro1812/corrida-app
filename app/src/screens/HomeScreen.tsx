import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { HomeStackParamList, RootTabParamList } from '../types/navigation';
import { Ciclo, Prova, Semana, provaAlvoDoCiclo } from '../types/api';
import { buscarCicloAtivo } from '../services/ciclos';
import { listarSemanasDoCiclo } from '../services/semanas';
import { sincronizarGarmin } from '../services/sync';
import { formatarData, formatarKm } from '../utils/formato';
import {
  agruparSemanasPorStatus,
  calcularAderenciaSemanaAtual,
  calcularContadorTreinos,
  calcularDiasAteProva,
  calcularKmRealizadoDaSemana,
  calcularProgressoKm,
  semanaEhAtual,
  semanaJaPassou,
} from '../utils/dashboard';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner, TipoBanner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'Home'>,
  BottomTabScreenProps<RootTabParamList>
>;

interface Mensagem {
  tipo: TipoBanner;
  titulo: string;
  mensagem?: string;
}

export function HomeScreen({ navigation }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [semanas, setSemanas] = useState<Semana[]>([]);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const cicloAtivo = await buscarCicloAtivo();
      if (!cicloAtivo) {
        setCiclo(null);
        setSemanas([]);
        return;
      }
      const listaSemanas = await listarSemanasDoCiclo(cicloAtivo.id);
      setCiclo(cicloAtivo);
      setSemanas(listaSemanas);
    } catch (erroCapturado) {
      setMensagem({
        tipo: 'erro',
        titulo: 'Erro ao carregar o ciclo ativo',
        mensagem: erroCapturado instanceof Error ? erroCapturado.message : undefined,
      });
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregarDados();
    }, [carregarDados]),
  );

  async function sincronizar() {
    setSincronizando(true);
    setMensagem(null);
    try {
      const resultado = await sincronizarGarmin();
      if (!resultado.ok) {
        setMensagem({
          tipo: 'erro',
          titulo: 'Sincronização falhou',
          mensagem: resultado.erro ?? 'Erro desconhecido',
        });
        return;
      }
      setMensagem({
        tipo: 'sucesso',
        titulo: 'Sincronização concluída',
        mensagem:
          `${resultado.atividadesImportadas} nova(s) atividade(s) · ` +
          `${resultado.atividadesJaExistentes} já existente(s) · ` +
          `${resultado.treinosCasadosComPrevisto} casada(s) com o previsto`,
      });
      await carregarDados();
    } catch (erroCapturado) {
      setMensagem({
        tipo: 'erro',
        titulo: 'Erro ao sincronizar',
        mensagem: erroCapturado instanceof Error ? erroCapturado.message : 'Tente novamente',
      });
    } finally {
      setSincronizando(false);
    }
  }

  if (carregando) {
    return <LoadingState />;
  }

  return (
    <Screen scroll>
      {mensagem ? (
        <Banner
          tipo={mensagem.tipo}
          titulo={mensagem.titulo}
          mensagem={mensagem.mensagem}
          onFechar={() => setMensagem(null)}
        />
      ) : null}

      <Button
        titulo="Sincronizar agora"
        onPress={() => void sincronizar()}
        carregando={sincronizando}
      />

      <View style={styles.linksTopo}>
        <Pressable onPress={() => navigation.navigate('HistoricoCiclos')}>
          <Text style={styles.link}>Histórico de ciclos</Text>
        </Pressable>
      </View>

      {!ciclo ? (
        <>
          <EmptyState
            emoji="🏃"
            titulo="Nenhum ciclo ativo"
            descricao="Crie um ciclo de preparação pra começar a acompanhar seus treinos."
          />
          <Button titulo="Criar ciclo" onPress={() => navigation.navigate('CriarEditarCiclo', {})} />
        </>
      ) : (
        <>
          <PainelCicloAtivo ciclo={ciclo} semanas={semanas} navigation={navigation} />
          <ListaSemanas semanas={semanas} navigation={navigation} />
        </>
      )}
    </Screen>
  );
}

function ListaSemanas({
  semanas,
  navigation,
}: {
  semanas: Semana[];
  navigation: Props['navigation'];
}) {
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

function LinhaSemana({ semana }: { semana: Semana }) {
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

function PainelCicloAtivo({
  ciclo,
  semanas,
  navigation,
}: {
  ciclo: Ciclo;
  semanas: Semana[];
  navigation: Props['navigation'];
}) {
  const provaAlvo = provaAlvoDoCiclo(ciclo);
  const provasSecundarias = ciclo.provas.filter((prova) => prova.tipo === 'secundaria');
  const dias = calcularDiasAteProva(provaAlvo?.data ?? null);
  const progresso = calcularProgressoKm(semanas);
  const aderencia = calcularAderenciaSemanaAtual(semanas);
  const treinos = calcularContadorTreinos(semanas);
  const percentualKm =
    progresso.kmPlanejadoTotal > 0
      ? Math.min(1, progresso.kmRealizadoTotal / progresso.kmPlanejadoTotal)
      : 0;

  return (
    <Card style={styles.painel}>
      <Pressable onPress={() => navigation.navigate('CriarEditarCiclo', { cicloId: ciclo.id })}>
        <Text style={tipografia.titulo}>{ciclo.nome}</Text>
        {provaAlvo ? <Text style={tipografia.legenda}>{provaAlvo.nome}</Text> : null}
      </Pressable>

      {dias !== null ? (
        <View style={styles.contagemBloco}>
          {dias >= 0 ? (
            <>
              <Text style={styles.contagemNumero}>{dias}</Text>
              <Text style={styles.contagemRotulo}>
                {dias === 0 ? 'a prova é hoje!' : `dia${dias === 1 ? '' : 's'} para a prova`}
              </Text>
            </>
          ) : (
            <Text style={styles.contagemPassada}>
              Prova foi há {Math.abs(dias)} dia{Math.abs(dias) === 1 ? '' : 's'}
            </Text>
          )}
        </View>
      ) : null}

      {provasSecundarias.length > 0 ? (
        <View style={styles.provasSecundarias}>
          {provasSecundarias.map((prova) => (
            <ContagemProvaSecundaria key={prova.id} prova={prova} />
          ))}
        </View>
      ) : null}

      <View style={styles.progressoBloco}>
        <Text style={tipografia.legenda}>
          {formatarKm(progresso.kmRealizadoTotal)} de {formatarKm(progresso.kmPlanejadoTotal)}{' '}
          planejados no ciclo
        </Text>
        <View style={styles.barraFundo}>
          <View style={[styles.barraPreenchida, { width: `${percentualKm * 100}%` }]} />
        </View>
      </View>

      <Text style={[tipografia.legenda, styles.aderencia]}>
        {aderencia.semana
          ? `Aderência da semana atual: ${aderencia.realizados}/${aderencia.elegiveis} treinos`
          : 'Nenhuma semana cadastrada cobre a data de hoje'}
      </Text>

      <View style={styles.contadorTreinos}>
        <Text style={tipografia.legenda}>
          {treinos.concluidosAteAgora}/{treinos.total} treinos concluídos
          {treinos.restantesAteAgora > 0 ? ` · ${treinos.restantesAteAgora} atrasado(s)` : ''}
        </Text>
      </View>
    </Card>
  );
}

function ContagemProvaSecundaria({ prova }: { prova: Prova }) {
  const dias = calcularDiasAteProva(prova.data);
  if (dias === null) {
    return null;
  }
  return (
    <Text style={tipografia.legenda}>
      🏁 {prova.nome}:{' '}
      {dias > 0
        ? `faltam ${dias} dia${dias === 1 ? '' : 's'}`
        : dias === 0
          ? 'é hoje!'
          : `foi há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  linksTopo: { alignItems: 'flex-end', marginTop: espacamento.sm },
  link: { color: cores.primaria, fontWeight: '600', fontSize: 13 },
  contagemBloco: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espacamento.xs + 2,
    marginTop: espacamento.md,
  },
  contagemNumero: { fontSize: 40, fontWeight: '800', color: cores.primariaEscura },
  contagemRotulo: { ...tipografia.corpoForte, color: cores.textoSecundario },
  contagemPassada: { ...tipografia.corpoForte, marginTop: espacamento.sm + 2, color: cores.primariaEscura },
  provasSecundarias: { marginTop: espacamento.sm, gap: espacamento.xs / 2 },
  painel: { marginTop: espacamento.md, marginBottom: espacamento.md },
  progressoBloco: { marginTop: espacamento.md },
  barraFundo: {
    height: 8,
    borderRadius: raio.pill,
    backgroundColor: cores.neutroFundo,
    marginTop: espacamento.xs + 2,
    overflow: 'hidden',
  },
  barraPreenchida: { height: '100%', backgroundColor: cores.primaria },
  aderencia: { marginTop: espacamento.sm + 2 },
  contadorTreinos: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  listaTitulo: { ...tipografia.legendaForte, marginBottom: espacamento.sm },
  linha: { marginBottom: espacamento.sm },
  linhaPassada: { backgroundColor: cores.sucessoFundo, borderColor: cores.sucesso },
  linhaAtual: { borderColor: cores.primaria, borderWidth: 1.5 },
  linhaConteudo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  linhaEsquerda: { flex: 1, gap: espacamento.xs / 2 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  linhaDireita: { alignItems: 'flex-end' },
  selo: {
    ...tipografia.legendaForte,
    color: cores.primaria,
    marginTop: espacamento.xs / 2,
  },
});
