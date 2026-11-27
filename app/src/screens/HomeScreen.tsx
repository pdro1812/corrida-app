import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { AbasParamList, RootStackParamList } from '../types/navigation';
import { Ciclo, Prova, Semana, TreinoPrevisto, provaAlvoDoCiclo } from '../types/modelo';
import { buscarCicloAtivo } from '../services/ciclos';
import { listarSemanasDoCiclo } from '../services/semanas';
import { listarProvasSemCiclo } from '../services/provas';
import { BlocoCiclo, listarBlocos } from '../services/blocosCiclo';
import { blocoDaData, posicaoNoBloco, ROTULO_TIPO_BLOCO } from '../dominio/blocosCiclo';
import { sincronizarGarmin } from '../services/sync';
import { listarTreinosSemRpe, TreinoSemRpe } from '../services/rpe';
import { formatarKm } from '../utils/formato';
import {
  calcularAderenciaSemanaAtual,
  calcularContadorTreinos,
  calcularDiasAteProva,
  calcularProgressoKm,
  hojeLocal,
  semanaEhAtual,
  treinosDoDia,
} from '../utils/dashboard';
import { LinhaSemana } from '../components/ListaSemanas';
import { TipoTreinoBadge } from '../components/TipoTreinoBadge';
import { CopiarPrevisto } from '../components/CopiarPrevisto';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner, TipoBanner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AbasParamList, 'Hoje'>,
  NativeStackScreenProps<RootStackParamList>
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
  const [semRpe, setSemRpe] = useState<TreinoSemRpe[]>([]);
  const [provasForaDoCiclo, setProvasForaDoCiclo] = useState<Prova[]>([]);
  const [blocos, setBlocos] = useState<BlocoCiclo[]>([]);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      setSemRpe(await listarTreinosSemRpe());
      setProvasForaDoCiclo(await listarProvasSemCiclo());
      const cicloAtivo = await buscarCicloAtivo();
      if (!cicloAtivo) {
        setCiclo(null);
        setSemanas([]);
        return;
      }
      const listaSemanas = await listarSemanasDoCiclo(cicloAtivo.id);
      setBlocos(await listarBlocos(cicloAtivo.id));
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

      {semRpe.length > 0 ? (
        <Pressable
          onPress={() => navigation.navigate('AvaliarTreino', { treinoRealizadoId: semRpe[0].id })}
          accessibilityRole="button"
        >
          <Banner
            tipo="aviso"
            titulo={semRpe.length === 1 ? '1 treino sem RPE' : `${semRpe.length} treinos sem RPE`}
            mensagem="Toque para registrar quanto custou (0 a 10)"
          />
        </Pressable>
      ) : null}

      <Button
        titulo="Sincronizar agora"
        onPress={() => void sincronizar()}
        carregando={sincronizando}
      />

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
          <TreinoDeHoje treinos={treinosDoDia(semanas, hojeLocal())} navigation={navigation} />
          <PainelCicloAtivo ciclo={ciclo} semanas={semanas} blocos={blocos} provasDepois={provasForaDoCiclo} navigation={navigation} />
          <SemanaAtual semanas={semanas} navigation={navigation} />
        </>
      )}
    </Screen>
  );
}

// O que está previsto para hoje, com o botão de copiar para o Garmin.
function TreinoDeHoje({ treinos, navigation }: { treinos: TreinoPrevisto[]; navigation: Props['navigation'] }) {
  return (
    <Card style={styles.hoje}>
      <Text style={tipografia.legendaForte}>Treino de hoje</Text>
      {treinos.length === 0 ? <Text style={[tipografia.corpo, styles.hojeVazio]}>Nada previsto para hoje.</Text> : null}
      {treinos.map((treino) => (
        <Pressable key={treino.id} onPress={() => navigation.navigate('TreinoDetalhe', { treino })} style={styles.hojeItem}>
          <View style={styles.hojeAcoes}>
            <TipoTreinoBadge tipo={treino.tipo} />
            <CopiarPrevisto descricao={treino.descricao} />
          </View>
          <Text style={tipografia.corpo}>{treino.descricao}</Text>
          {treino.realizados.length > 0 ? <Text style={styles.hojeFeito}>✓ Realizado</Text> : null}
        </Pressable>
      ))}
    </Card>
  );
}

function SemanaAtual({ semanas, navigation }: { semanas: Semana[]; navigation: Props['navigation'] }) {
  const atual = semanas.find(semanaEhAtual);
  return (
    <>
      {atual ? (
        <Pressable onPress={() => navigation.navigate('Semana', { semanaId: atual.id })}>
          <LinhaSemana semana={atual} />
        </Pressable>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Abas', { screen: 'Ciclo' })}>
        <Text style={styles.link}>Ver todas as semanas e provas</Text>
      </Pressable>
    </>
  );
}

function BlocoAtual({ blocos }: { blocos: BlocoCiclo[] }) {
  const hoje = hojeLocal();
  const bloco = blocoDaData(blocos, hoje);
  if (!bloco) return null;
  const { atual, total } = posicaoNoBloco(bloco, hoje);
  return (
    <Text style={styles.blocoAtual}>
      {bloco.nome}
      {bloco.nome.includes(ROTULO_TIPO_BLOCO[bloco.tipo]) ? '' : ` · ${ROTULO_TIPO_BLOCO[bloco.tipo]}`} · semana {atual} de {total}
    </Text>
  );
}

function PainelCicloAtivo({
  ciclo,
  semanas,
  blocos,
  provasDepois,
  navigation,
}: {
  ciclo: Ciclo;
  semanas: Semana[];
  blocos: BlocoCiclo[];
  provasDepois: Prova[];
  navigation: Props['navigation'];
}) {
  const provaAlvo = provaAlvoDoCiclo(ciclo);
  // Secundárias do ciclo e provas fora dele (ex.: o próximo objetivo).
  const provasSecundarias = [...ciclo.provas.filter((prova) => prova.tipo === 'secundaria'), ...provasDepois].sort((a, b) =>
    a.data.localeCompare(b.data),
  );
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
      <BlocoAtual blocos={blocos} />

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
  link: { color: cores.primaria, fontWeight: '600', fontSize: 13, textAlign: 'right', marginBottom: espacamento.lg },
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
  hoje: { marginTop: espacamento.md },
  blocoAtual: { ...tipografia.legendaForte, color: cores.primaria, marginTop: espacamento.xs },
  hojeVazio: { marginTop: espacamento.xs, color: cores.textoSecundario },
  hojeItem: { marginTop: espacamento.sm, gap: espacamento.xs },
  hojeAcoes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hojeFeito: { ...tipografia.legendaForte, color: cores.sucesso },
});
