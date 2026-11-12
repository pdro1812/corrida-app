import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { formatarData, formatarKm } from '../utils/formato';
import { agregarRealizados } from '../utils/comparacao';
import { rotuloSensacao, SENSACOES_DISPONIVEIS } from '../utils/sensacoes';
import { excluirTreino, marcarNaoRealizado, registrarFeedback } from '../services/treinos';
import { excluirTreinoRealizado } from '../services/treinosRealizados';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { Chip } from '../components/Chip';
import { Banner } from '../components/Banner';
import { TipoTreinoBadge } from '../components/TipoTreinoBadge';
import { espacamento, tipografia } from '../theme/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'TreinoDetalhe'>;

export function TreinoDetalheScreen({ route, navigation }: Props) {
  const { treino } = route.params;
  const realizados = treino.realizados;
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  function confirmarExclusao() {
    Alert.alert(
      'Excluir treino',
      'Isso remove este treino previsto. Se houver um treino realizado vinculado a ele (Garmin ou manual), ele não é apagado — só deixa de estar vinculado a este previsto. Confirma?',
      [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          setExcluindo(true);
          excluirTreino(treino.id)
            .then(() => navigation.goBack())
            .catch((erroCapturado) =>
              setErroExclusao(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)),
            )
            .finally(() => setExcluindo(false));
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      {erroExclusao ? (
        <Banner tipo="erro" titulo="Não foi possível excluir" mensagem={erroExclusao} onFechar={() => setErroExclusao(null)} />
      ) : null}
      <Text style={[tipografia.titulo, styles.capitalizado]}>
        {treino.diaSemana} · {formatarData(treino.data)}
      </Text>
      <View style={styles.badge}>
        <TipoTreinoBadge tipo={treino.tipo} />
      </View>
      <Text style={[tipografia.corpo, styles.descricao]}>{treino.descricao}</Text>
      <Text style={tipografia.legenda}>
        Previsto: {formatarKm(treino.distanciaAlvoKm)}
        {treino.paceAlvoMin ? ` · ${treino.paceAlvoMin}-${treino.paceAlvoMax}/km` : ''}
      </Text>

      {treino.intervalos?.some((intervalo) => intervalo.tipo === 'tiro') ? (
        <View style={styles.espacoTopo}>
          <Button
            titulo="Ver detalhe do tiro"
            variante="secundaria"
            onPress={() => navigation.navigate('TreinoTiro', { treinoId: treino.id })}
          />
        </View>
      ) : null}

      {treino.status === 'nao_realizado' ? (
        <Card style={styles.secao}>
          <Text style={tipografia.subtitulo}>❌ Não realizado</Text>
          <Text style={[tipografia.corpo, { marginTop: espacamento.xs }]}>
            Motivo: {treino.motivoNaoRealizado}
          </Text>
        </Card>
      ) : realizados.length > 0 ? (
        <>
          {realizados.length > 1 ? (
            <Card style={styles.secao}>
              <Text style={tipografia.subtitulo}>
                {realizados.length} atividades vinculadas a este treino
              </Text>
              <Text style={[tipografia.corpo, { marginTop: espacamento.xs }]}>
                Total: {formatarKm(agregarRealizados(realizados).distanciaKm)}
                {agregarRealizados(realizados).paceMedio
                  ? ` · ${agregarRealizados(realizados).paceMedio}/km`
                  : ''}
              </Text>
            </Card>
          ) : null}
          {realizados.map((realizado, indice) => (
            <FormularioFeedback
              key={realizado.id}
              titulo={
                realizados.length > 1
                  ? `Atividade ${indice + 1} · ${formatarKm(realizado.distanciaKm)}${
                      realizado.paceMedio ? ` · ${realizado.paceMedio}/km` : ''
                    }`
                  : 'Como foi o treino?'
              }
              treinoRealizadoId={realizado.id}
              rpeInicial={realizado.rpe}
              sensacoesIniciais={realizado.sensacoes}
              textoInicial={realizado.feedbackTexto}
              onSalvo={() => navigation.goBack()}
            />
          ))}
        </>
      ) : (
        <View style={styles.secao}>
          <View style={styles.espacoTopo}>
            <Button
              titulo="Registrar treino"
              onPress={() =>
                navigation.navigate('RegistrarTreinoManual', {
                  semanaId: treino.semanaId,
                  treinoPrevistoId: treino.id,
                })
              }
            />
          </View>
          <FormularioNaoRealizado treinoId={treino.id} onSalvo={() => navigation.goBack()} />
        </View>
      )}

      <View style={styles.espacoExcluir}>
        <Button
          titulo="Excluir treino"
          variante="perigo"
          onPress={confirmarExclusao}
          carregando={excluindo}
        />
      </View>
    </Screen>
  );
}

function FormularioNaoRealizado({
  treinoId,
  onSalvo,
}: {
  treinoId: string;
  onSalvo: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!motivo.trim()) {
      setErro('Informe o motivo');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await marcarNaoRealizado(treinoId, motivo.trim());
      onSalvo();
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Tente novamente');
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <View style={styles.espacoTopo}>
        <Button
          titulo="Marcar como não realizado"
          variante="perigo"
          onPress={() => setAberto(true)}
        />
      </View>
    );
  }

  return (
    <Card style={styles.espacoTopo}>
      {erro ? <Banner tipo="erro" titulo="Não foi possível salvar" mensagem={erro} onFechar={() => setErro(null)} /> : null}
      <TextField
        rotulo="Motivo"
        placeholder="Ex: chuva forte, dor no joelho..."
        value={motivo}
        onChangeText={setMotivo}
        multiline
      />
      <Button titulo="Confirmar" onPress={() => void salvar()} carregando={salvando} />
    </Card>
  );
}

export function FormularioFeedback({
  titulo,
  treinoRealizadoId,
  rpeInicial,
  sensacoesIniciais,
  textoInicial,
  onSalvo,
}: {
  titulo: string;
  treinoRealizadoId: string;
  rpeInicial: number | null;
  sensacoesIniciais: string[];
  textoInicial: string | null;
  onSalvo: () => void;
}) {
  const [rpe, setRpe] = useState<number | null>(rpeInicial);
  const [sensacoes, setSensacoes] = useState<string[]>(sensacoesIniciais);
  const [texto, setTexto] = useState(textoInicial ?? '');
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function confirmarExclusaoCorrida() {
    Alert.alert(
      'Excluir corrida',
      'Isso remove só o registro do que foi corrido (Garmin ou manual) — o treino previsto continua, volta pra "pendente". Confirma?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            setExcluindo(true);
            excluirTreinoRealizado(treinoRealizadoId)
              .then(onSalvo)
              .catch((erroCapturado) =>
                setErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)),
              )
              .finally(() => setExcluindo(false));
          },
        },
      ],
    );
  }

  function alternarSensacao(sensacao: string) {
    setSensacoes((atual) =>
      atual.includes(sensacao) ? atual.filter((s) => s !== sensacao) : [...atual, sensacao],
    );
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await registrarFeedback(treinoRealizadoId, {
        rpe: rpe ?? undefined,
        sensacoes,
        feedbackTexto: texto.trim() || undefined,
      });
      onSalvo();
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Tente novamente');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card style={styles.secao}>
      {erro ? <Banner tipo="erro" titulo="Não foi possível salvar" mensagem={erro} onFechar={() => setErro(null)} /> : null}
      <Text style={tipografia.subtitulo}>{titulo}</Text>

      <Text style={[tipografia.legendaForte, styles.rotulo]}>RPE (esforço percebido)</Text>
      <View style={styles.linhaRpe}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((valor) => (
          <Chip
            key={valor}
            rotulo={String(valor)}
            selecionado={rpe === valor}
            onPress={() => setRpe(valor)}
          />
        ))}
      </View>

      <Text style={[tipografia.legendaForte, styles.rotulo]}>Sensações</Text>
      <View style={styles.chips}>
        {SENSACOES_DISPONIVEIS.map((sensacao) => (
          <Chip
            key={sensacao}
            rotulo={rotuloSensacao(sensacao)}
            selecionado={sensacoes.includes(sensacao)}
            onPress={() => alternarSensacao(sensacao)}
          />
        ))}
      </View>

      <TextField
        rotulo="Relato livre"
        placeholder="Como se sentiu, algo pra lembrar..."
        value={texto}
        onChangeText={setTexto}
        multiline
      />

      <Button titulo="Salvar feedback" onPress={() => void salvar()} carregando={salvando} />

      <View style={styles.espacoTopo}>
        <Button
          titulo="Excluir corrida"
          variante="perigo"
          onPress={confirmarExclusaoCorrida}
          carregando={excluindo}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  capitalizado: { textTransform: 'capitalize' },
  badge: { marginTop: espacamento.sm },
  descricao: { marginTop: espacamento.sm, marginBottom: espacamento.xs },
  secao: { marginTop: espacamento.lg },
  espacoTopo: { marginTop: espacamento.md },
  espacoExcluir: { marginTop: espacamento.xl },
  rotulo: { marginTop: espacamento.md, marginBottom: espacamento.sm },
  linhaRpe: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginBottom: espacamento.md },
});
