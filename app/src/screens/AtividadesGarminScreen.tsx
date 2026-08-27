import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TreinoPrevisto, TreinoRealizadoComPrevisto } from '../types/api';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { Button } from '../components/Button';
import {
  buscarCandidatosVinculo,
  listarTreinosRealizados,
  vincularTreinoRealizado,
} from '../services/treinosRealizados';
import { formatarData, formatarDuracao, formatarKm } from '../utils/formato';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

// RF12-RF15: mostra o que foi importado do Garmin — dado bruto da
// atividade e se ela foi casada com algum treino previsto.
export function AtividadesGarminScreen() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atividades, setAtividades] = useState<TreinoRealizadoComPrevisto[]>([]);
  const [editando, setEditando] = useState<TreinoRealizadoComPrevisto | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    return listarTreinosRealizados('garmin')
      .then((resultado) => setAtividades(resultado))
      .catch((erroCapturado) => setErro(String(erroCapturado)))
      .finally(() => setCarregando(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (carregando) {
    return <LoadingState />;
  }

  return (
    <Screen>
      {erro ? <Banner tipo="erro" titulo="Erro ao carregar atividades" mensagem={erro} /> : null}
      <FlatList
        data={atividades}
        keyExtractor={(atividade) => atividade.id}
        ListHeaderComponent={
          atividades.length > 0 ? (
            <Text style={styles.contagem}>
              {atividades.length} atividade{atividades.length === 1 ? '' : 's'} sincronizada
              {atividades.length === 1 ? '' : 's'} do Garmin
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <LinhaAtividade atividade={item} onEditarVinculo={() => setEditando(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            emoji="🛰️"
            titulo="Nenhuma atividade sincronizada ainda"
            descricao='Use o botão "Sincronizar agora" na Home pra importar suas corridas do Garmin Connect.'
          />
        }
      />
      {editando ? (
        <EditarVinculoModal
          atividade={editando}
          onFechar={() => setEditando(null)}
          onVinculado={() => {
            setEditando(null);
            carregar();
          }}
        />
      ) : null}
    </Screen>
  );
}

function LinhaAtividade({
  atividade,
  onEditarVinculo,
}: {
  atividade: TreinoRealizadoComPrevisto;
  onEditarVinculo: () => void;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.cabecalho}>
        <Text style={tipografia.corpoForte}>{formatarData(atividade.data)}</Text>
        <View style={styles.selo}>
          <Text style={styles.seloTexto}>🛰️ Garmin</Text>
        </View>
      </View>

      <View style={styles.metricas}>
        <Metrica rotulo="Distância" valor={formatarKm(atividade.distanciaKm)} />
        <Metrica rotulo="Duração" valor={formatarDuracao(atividade.duracaoSegundos)} />
        <Metrica rotulo="Pace" valor={atividade.paceMedio ? `${atividade.paceMedio}/km` : '-'} />
      </View>
      {atividade.fcMedia || atividade.fcMax || atividade.elevacaoM ? (
        <View style={styles.metricas}>
          <Metrica rotulo="FC média" valor={atividade.fcMedia ? `${atividade.fcMedia} bpm` : '-'} />
          <Metrica rotulo="FC máx" valor={atividade.fcMax ? `${atividade.fcMax} bpm` : '-'} />
          <Metrica
            rotulo="Elevação"
            valor={atividade.elevacaoM !== null ? `${atividade.elevacaoM} m` : '-'}
          />
        </View>
      ) : null}

      {atividade.treinoPrevisto ? (
        <View style={styles.casamento}>
          <Text style={[tipografia.legenda, styles.casamentoSucesso]}>
            ✅ Casado com: {atividade.treinoPrevisto.diaSemana} · {atividade.treinoPrevisto.descricao}
          </Text>
        </View>
      ) : (
        <View style={styles.casamento}>
          <Text style={[tipografia.legenda, styles.casamentoAviso]}>
            ⚠️ Sem treino previsto correspondente
          </Text>
        </View>
      )}

      <Pressable onPress={onEditarVinculo} style={styles.editarVinculo}>
        <Text style={styles.editarVinculoTexto}>Editar vínculo</Text>
      </Pressable>
    </Card>
  );
}

// Corrige o casamento automático (RF15) quando ele erra — ex: treino
// adiantado/atrasado vários dias na semana, fora da janela de ±1 dia que
// o matching automático usa.
function EditarVinculoModal({
  atividade,
  onFechar,
  onVinculado,
}: {
  atividade: TreinoRealizadoComPrevisto;
  onFechar: () => void;
  onVinculado: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<TreinoPrevisto[]>([]);

  useEffect(() => {
    buscarCandidatosVinculo(atividade.data)
      .then(setCandidatos)
      .catch((erroCapturado) => setErro(String(erroCapturado)))
      .finally(() => setCarregando(false));
  }, [atividade.data]);

  async function selecionar(treinoPrevistoId: string | null) {
    setSalvando(true);
    setErro(null);
    try {
      await vincularTreinoRealizado(atividade.id, treinoPrevistoId);
      onVinculado();
    } catch (erroCapturado) {
      setErro(String(erroCapturado));
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalConteudo}>
          <Text style={tipografia.corpoForte}>Editar vínculo</Text>
          <Text style={[tipografia.legenda, styles.modalSubtitulo]}>
            Atividade de {formatarData(atividade.data)} · {formatarKm(atividade.distanciaKm)}
          </Text>

          {erro ? <Banner tipo="erro" titulo="Erro" mensagem={erro} /> : null}

          {carregando ? (
            <ActivityIndicator style={styles.modalCarregando} />
          ) : (
            <FlatList
              data={candidatos}
              keyExtractor={(item) => item.id}
              style={styles.modalLista}
              ListEmptyComponent={
                <Text style={tipografia.legenda}>
                  Nenhum treino previsto encontrado perto dessa data.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.candidato,
                    item.id === atividade.treinoPrevistoId && styles.candidatoSelecionado,
                  ]}
                  disabled={salvando}
                  onPress={() => selecionar(item.id)}
                >
                  <Text style={tipografia.corpoForte}>
                    {formatarData(item.data)} · {item.diaSemana}
                  </Text>
                  <Text style={tipografia.legenda}>{item.descricao}</Text>
                </Pressable>
              )}
            />
          )}

          {atividade.treinoPrevistoId ? (
            <Pressable
              style={styles.desvincular}
              disabled={salvando}
              onPress={() => selecionar(null)}
            >
              <Text style={styles.desvincularTexto}>Desvincular (deixar avulso)</Text>
            </Pressable>
          ) : null}

          <Button
            titulo="Cancelar"
            variante="secundaria"
            onPress={onFechar}
            desabilitado={salvando}
          />
        </View>
      </View>
    </Modal>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.metrica}>
      <Text style={tipografia.legenda}>{rotulo}</Text>
      <Text style={tipografia.corpoForte}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contagem: { ...tipografia.legenda, marginBottom: espacamento.sm },
  card: { marginBottom: espacamento.sm },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    textTransform: 'capitalize',
  },
  selo: {
    backgroundColor: cores.primariaFundo,
    borderRadius: raio.pill,
    paddingHorizontal: espacamento.sm,
    paddingVertical: espacamento.xs / 2,
  },
  seloTexto: { fontSize: 12, fontWeight: '600', color: cores.primaria },
  metricas: { flexDirection: 'row', marginTop: espacamento.sm, gap: espacamento.lg },
  metrica: { gap: espacamento.xs / 2 },
  casamento: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  casamentoSucesso: { color: cores.sucesso },
  casamentoAviso: { color: cores.aviso },
  editarVinculo: { marginTop: espacamento.sm, alignSelf: 'flex-start' },
  editarVinculoTexto: { ...tipografia.legenda, color: cores.primaria, fontWeight: '600' },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: espacamento.lg,
  },
  modalConteudo: {
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.lg,
    gap: espacamento.sm,
    maxHeight: '80%',
  },
  modalSubtitulo: { marginBottom: espacamento.xs },
  modalCarregando: { marginVertical: espacamento.lg },
  modalLista: { flexGrow: 0 },
  candidato: {
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.borda,
    marginBottom: espacamento.xs,
  },
  candidatoSelecionado: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaFundo,
  },
  desvincular: { alignSelf: 'center', paddingVertical: espacamento.xs },
  desvincularTexto: { ...tipografia.legenda, color: cores.erro },
});
