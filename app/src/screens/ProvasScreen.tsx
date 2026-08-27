import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ciclo, Prova } from '../types/api';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { Chip } from '../components/Chip';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { buscarCicloAtivo } from '../services/ciclos';
import { criarProva, excluirProva, listarProvas, registrarResultadoProva } from '../services/provas';
import { formatarData, formatarDuracao } from '../utils/formato';
import { cores, espacamento, tipografia } from '../theme/theme';

export function ProvasScreen() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [provas, setProvas] = useState<Prova[]>([]);
  const [formularioAberto, setFormularioAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const cicloAtivo = await buscarCicloAtivo();
      setCiclo(cicloAtivo);
      setProvas(cicloAtivo ? await listarProvas(cicloAtivo.id) : []);
    } catch (erroCapturado) {
      setErro(String(erroCapturado));
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function remover(id: string) {
    try {
      await excluirProva(id);
      await carregar();
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado));
    }
  }

  if (carregando) {
    return <LoadingState />;
  }

  if (!ciclo) {
    return (
      <Screen>
        <EmptyState
          emoji="🏁"
          titulo="Nenhum ciclo ativo"
          descricao="Crie um ciclo pra cadastrar a prova alvo e provas secundárias."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {erro ? <Banner tipo="erro" titulo="Não foi possível concluir a ação" mensagem={erro} onFechar={() => setErro(null)} /> : null}

      {provas.map((prova) => (
        <LinhaProva key={prova.id} prova={prova} onExcluir={() => void remover(prova.id)} onAtualizado={carregar} onErro={setErro} />
      ))}

      {formularioAberto ? (
        <FormularioProva
          cicloId={ciclo.id}
          onCriado={() => {
            setFormularioAberto(false);
            void carregar();
          }}
          onCancelar={() => setFormularioAberto(false)}
          onErro={setErro}
        />
      ) : (
        <Button titulo="+ Adicionar prova secundária" variante="secundaria" onPress={() => setFormularioAberto(true)} />
      )}
    </Screen>
  );
}

function LinhaProva({
  prova,
  onExcluir,
  onAtualizado,
  onErro,
}: {
  prova: Prova;
  onExcluir: () => void;
  onAtualizado: () => void;
  onErro: (mensagem: string) => void;
}) {
  const [registrandoResultado, setRegistrandoResultado] = useState(false);
  const [tempo, setTempo] = useState('');
  const [pace, setPace] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvarResultado() {
    const minutos = tempo.split(':').map(Number);
    if (minutos.some(Number.isNaN) || minutos.length < 2) {
      onErro('Use o formato H:MM:SS ou M:SS pra registrar o resultado');
      return;
    }
    const segundos =
      minutos.length === 3
        ? minutos[0] * 3600 + minutos[1] * 60 + minutos[2]
        : minutos[0] * 60 + minutos[1];

    setSalvando(true);
    try {
      await registrarResultadoProva(prova.id, {
        resultadoTempoSegundos: segundos,
        resultadoPace: pace.trim() || undefined,
      });
      setRegistrandoResultado(false);
      onAtualizado();
    } catch (erroCapturado) {
      onErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.cabecalho}>
        <Text style={tipografia.subtitulo}>{prova.nome}</Text>
        <Chip rotulo={prova.tipo === 'alvo' ? 'Alvo' : 'Secundária'} selecionado={prova.tipo === 'alvo'} onPress={() => {}} />
      </View>
      <Text style={tipografia.legenda}>{formatarData(prova.data)}</Text>

      {prova.concluida ? (
        <Text style={[tipografia.corpo, styles.resultado]}>
          ✅ {formatarDuracao(prova.resultadoTempoSegundos)}
          {prova.resultadoPace ? ` · ${prova.resultadoPace}/km` : ''}
        </Text>
      ) : registrandoResultado ? (
        <View style={styles.formularioResultado}>
          <TextField rotulo="Tempo (H:MM:SS)" value={tempo} onChangeText={setTempo} placeholder="1:45:30" />
          <TextField rotulo="Pace médio (opcional)" value={pace} onChangeText={setPace} placeholder="4:59" />
          <Button titulo="Salvar resultado" onPress={() => void salvarResultado()} carregando={salvando} />
        </View>
      ) : (
        <View style={styles.acoes}>
          <Button titulo="Registrar resultado" variante="secundaria" onPress={() => setRegistrandoResultado(true)} />
          {prova.tipo !== 'alvo' ? <Button titulo="Excluir" variante="perigo" onPress={onExcluir} /> : null}
        </View>
      )}
    </Card>
  );
}

function FormularioProva({
  cicloId,
  onCriado,
  onCancelar,
  onErro,
}: {
  cicloId: string;
  onCriado: () => void;
  onCancelar: () => void;
  onErro: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [distanciaKm, setDistanciaKm] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim() || !data.trim()) {
      onErro('Preencha nome e data da prova');
      return;
    }
    setSalvando(true);
    try {
      await criarProva(cicloId, {
        nome: nome.trim(),
        data,
        tipo: 'secundaria',
        distanciaKm: distanciaKm.trim() ? Number(distanciaKm) : undefined,
      });
      onCriado();
    } catch (erroCapturado) {
      onErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <TextField rotulo="Nome da prova" value={nome} onChangeText={setNome} placeholder="10km de aquecimento" />
      <TextField rotulo="Data (AAAA-MM-DD)" value={data} onChangeText={setData} placeholder="2026-10-04" />
      <TextField
        rotulo="Distância em km (opcional)"
        value={distanciaKm}
        onChangeText={setDistanciaKm}
        placeholder="10"
        keyboardType="numeric"
      />
      <View style={styles.acoes}>
        <Button titulo="Salvar" onPress={() => void salvar()} carregando={salvando} />
        <Button titulo="Cancelar" variante="secundaria" onPress={onCancelar} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultado: { marginTop: espacamento.sm, color: cores.sucesso, fontWeight: '600' },
  formularioResultado: { marginTop: espacamento.sm },
  acoes: { flexDirection: 'row', gap: espacamento.sm, marginTop: espacamento.sm },
});
