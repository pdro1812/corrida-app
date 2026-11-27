import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ciclo } from '../types/modelo';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { Chip } from '../components/Chip';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { buscarCicloAtivo } from '../services/ciclos';
import { criarProva, excluirProva, listarCalendarioProvas, ProvaDoCalendario, registrarResultadoProva } from '../services/provas';
import { lerTempo } from '../services/recordes';
import { calcularDiasAteProva } from '../utils/dashboard';
import { formatarData, formatarDuracao } from '../utils/formato';
import { cores, espacamento, tipografia } from '../theme/theme';

// Calendário de provas: todas as provas, do ciclo atual ou fora dele (ex.:
// o próximo objetivo depois da prova alvo). Uma prova não depende da outra,
// mas todas entram no perfil da análise.
export function ProvasScreen() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [provas, setProvas] = useState<ProvaDoCalendario[]>([]);
  const [formularioAberto, setFormularioAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setCiclo(await buscarCicloAtivo());
      setProvas(await listarCalendarioProvas());
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

  const proximas = provas.filter((p) => !p.concluida);
  const feitas = provas.filter((p) => p.concluida).reverse();

  return (
    <Screen scroll>
      {erro ? <Banner tipo="erro" titulo="Não foi possível concluir a ação" mensagem={erro} onFechar={() => setErro(null)} /> : null}

      {formularioAberto ? (
        <FormularioProva
          ciclo={ciclo}
          onCriado={() => {
            setFormularioAberto(false);
            void carregar();
          }}
          onCancelar={() => setFormularioAberto(false)}
          onErro={setErro}
        />
      ) : (
        <View style={styles.adicionar}>
          <Button titulo="+ Adicionar prova" variante="secundaria" onPress={() => setFormularioAberto(true)} />
        </View>
      )}

      {provas.length === 0 ? (
        <EmptyState emoji="🏁" titulo="Nenhuma prova cadastrada" descricao="Cadastre a prova alvo ao criar o ciclo, ou adicione provas aqui." />
      ) : null}

      {proximas.length > 0 ? <Text style={styles.secao}>Próximas</Text> : null}
      {proximas.map((prova) => (
        <LinhaProva key={prova.id} prova={prova} onExcluir={() => void remover(prova.id)} onAtualizado={carregar} onErro={setErro} />
      ))}

      {feitas.length > 0 ? <Text style={styles.secao}>Feitas</Text> : null}
      {feitas.map((prova) => (
        <LinhaProva key={prova.id} prova={prova} onExcluir={() => void remover(prova.id)} onAtualizado={carregar} onErro={setErro} />
      ))}
    </Screen>
  );
}

function rotuloTipo(prova: ProvaDoCalendario): string {
  if (prova.tipo === 'alvo') return prova.cicloId ? 'Alvo' : 'Objetivo futuro';
  return prova.cicloId ? 'Secundária' : 'Avulsa';
}

function LinhaProva({
  prova,
  onExcluir,
  onAtualizado,
  onErro,
}: {
  prova: ProvaDoCalendario;
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
        <Chip rotulo={rotuloTipo(prova)} selecionado={prova.tipo === 'alvo'} onPress={() => {}} />
      </View>
      <Text style={tipografia.legenda}>
        {formatarData(prova.data)}/{prova.data.slice(0, 4)}
        {prova.distanciaKm ? ` · ${prova.distanciaKm} km` : ''}
        {prova.metaTempoSegundos ? ` · meta ${formatarDuracao(prova.metaTempoSegundos)}` : ''}
        {!prova.concluida ? contagem(prova.data) : ''}
      </Text>
      <Text style={tipografia.legenda}>{prova.cicloNome ? `Ciclo: ${prova.cicloNome}` : 'Fora de ciclo'}</Text>

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
          {prova.tipo !== 'alvo' || !prova.cicloId ? <Button titulo="Excluir" variante="perigo" onPress={onExcluir} /> : null}
        </View>
      )}
    </Card>
  );
}

function contagem(data: string): string {
  const dias = calcularDiasAteProva(data);
  if (dias === null || dias < 0) return '';
  if (dias === 0) return ' · hoje!';
  return dias < 14 ? ` · em ${dias} dia(s)` : ` · em ${Math.floor(dias / 7)} semanas`;
}

type Vinculo = 'ciclo' | 'futuro' | 'avulsa';

function FormularioProva({
  ciclo,
  onCriado,
  onCancelar,
  onErro,
}: {
  ciclo: Ciclo | null;
  onCriado: () => void;
  onCancelar: () => void;
  onErro: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [distanciaKm, setDistanciaKm] = useState('');
  const [meta, setMeta] = useState('');
  const [vinculo, setVinculo] = useState<Vinculo>(ciclo ? 'ciclo' : 'futuro');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim() || !data.trim()) {
      onErro('Preencha nome e data da prova');
      return;
    }
    const metaSegundos = meta.trim() ? lerTempo(meta) : null;
    if (meta.trim() && metaSegundos === null) {
      onErro('Meta no formato H:MM:SS ou M:SS');
      return;
    }
    setSalvando(true);
    try {
      await criarProva(vinculo === 'ciclo' && ciclo ? ciclo.id : null, {
        nome: nome.trim(),
        data: data.trim(),
        tipo: vinculo === 'futuro' ? 'alvo' : 'secundaria',
        distanciaKm: distanciaKm.trim() ? Number(distanciaKm.replace(',', '.')) : undefined,
        metaTempoSegundos: metaSegundos ?? undefined,
      });
      onCriado();
    } catch (erroCapturado) {
      onErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado));
    } finally {
      setSalvando(false);
    }
  }

  const opcoes: { valor: Vinculo; rotulo: string }[] = [
    ...(ciclo ? [{ valor: 'ciclo' as const, rotulo: 'Secundária do ciclo atual' }] : []),
    { valor: 'futuro', rotulo: 'Objetivo futuro (alvo de outro ciclo)' },
    { valor: 'avulsa', rotulo: 'Avulsa, sem ciclo' },
  ];

  return (
    <Card style={styles.card}>
      <TextField rotulo="Nome da prova" value={nome} onChangeText={setNome} placeholder="NK42k POA" />
      <TextField rotulo="Data (AAAA-MM-DD)" value={data} onChangeText={setData} placeholder="2027-08-22" />
      <TextField
        rotulo="Distância em km (opcional)"
        value={distanciaKm}
        onChangeText={setDistanciaKm}
        placeholder="42.2"
        keyboardType="decimal-pad"
      />
      <TextField rotulo="Meta de tempo (opcional)" value={meta} onChangeText={setMeta} placeholder="3:29:00" />
      <View style={styles.chips}>
        {opcoes.map((o) => (
          <Chip key={o.valor} rotulo={o.rotulo} selecionado={vinculo === o.valor} onPress={() => setVinculo(o.valor)} />
        ))}
      </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.xs, marginTop: espacamento.sm },
  secao: { ...tipografia.legendaForte, marginTop: espacamento.md, marginBottom: espacamento.sm },
  adicionar: { marginBottom: espacamento.sm },
});
