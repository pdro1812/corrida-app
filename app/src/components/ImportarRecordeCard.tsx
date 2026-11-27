import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { buscarCandidatosRecorde, CandidatoRecorde, criarRecorde } from '../services/recordes';
import { buscarCorridasNoPeriodo, melhorTrechoDaAtividade } from '../services/sync';
import { hojeLocal } from '../utils/dashboard';
import { formatarData, formatarDuracao, formatarKm } from '../utils/formato';
import { cores, espacamento, tipografia } from '../theme/theme';

type Aviso = { tipo: 'sucesso' | 'erro'; titulo: string; mensagem?: string };

const DISTANCIAS = [5, 10, 21.1, 42.2];

function umAnoAtras(hoje: string): string {
  return `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`;
}

function pace(segundos: number, km: number): string {
  const s = Math.round(segundos / km);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`;
}

// Importar recorde: escolhe a distância e o período, o app lista as corridas
// (do diário e do Garmin, mesmo as não sincronizadas) e o recorde sai da
// atividade inteira ou do melhor trecho dentro de uma corrida mais longa.
export function ImportarRecordeCard({ onAviso, onImportado }: { onAviso: (a: Aviso) => void; onImportado: () => void }) {
  const hoje = hojeLocal();
  const [distancia, setDistancia] = useState('10');
  const [inicio, setInicio] = useState(umAnoAtras(hoje));
  const [fim, setFim] = useState(hoje);
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoRecorde[] | null>(null);
  const [trechos, setTrechos] = useState<Record<string, number | 'carregando' | 'sem'>>({});

  const km = Number(distancia.replace(',', '.'));

  async function buscar() {
    if (!Number.isFinite(km) || km <= 0) {
      onAviso({ tipo: 'erro', titulo: 'Informe a distância em km' });
      return;
    }
    setBuscando(true);
    setTrechos({});
    try {
      const { candidatos: lista, erroGarmin } = await buscarCandidatosRecorde(inicio.trim(), fim.trim(), km, buscarCorridasNoPeriodo);
      setCandidatos(lista.slice(0, 20));
      if (erroGarmin) onAviso({ tipo: 'erro', titulo: 'Garmin indisponível, mostrando só o diário', mensagem: erroGarmin });
    } catch (erro) {
      onAviso({ tipo: 'erro', titulo: 'Não foi possível buscar', mensagem: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      setBuscando(false);
    }
  }

  async function calcularTrecho(c: CandidatoRecorde) {
    if (!c.garminActivityId) return;
    const id = c.garminActivityId;
    setTrechos((t) => ({ ...t, [id]: 'carregando' }));
    try {
      const r = await melhorTrechoDaAtividade(id, km * 1000);
      setTrechos((t) => ({ ...t, [id]: r ? r.segundos : 'sem' }));
    } catch (erro) {
      setTrechos((t) => ({ ...t, [id]: 'sem' }));
      onAviso({ tipo: 'erro', titulo: 'Não foi possível ler a atividade', mensagem: erro instanceof Error ? erro.message : String(erro) });
    }
  }

  async function salvar(c: CandidatoRecorde, segundos: number, trecho: boolean) {
    try {
      await criarRecorde({
        distanciaKm: String(km),
        tempo: formatarDuracao(segundos),
        data: c.data,
        descricao: trecho ? `Melhor ${km} km dentro de ${formatarKm(c.distanciaKm)}` : `Atividade de ${formatarKm(c.distanciaKm)}`,
        garminActivityId: c.garminActivityId,
      });
      onAviso({ tipo: 'sucesso', titulo: `Recorde de ${km} km salvo: ${formatarDuracao(segundos)}` });
      onImportado();
    } catch (erro) {
      onAviso({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: erro instanceof Error ? erro.message : String(erro) });
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={tipografia.subtitulo}>Importar recorde de uma corrida</Text>
      <Text style={[tipografia.legenda, styles.texto]}>
        Escolha a distância e o período. Aparecem as corridas do diário e as do Garmin, mesmo as que não foram
        sincronizadas. Em corridas mais longas, o app procura o trecho mais rápido daquela distância.
      </Text>
      <View style={styles.chips}>
        {DISTANCIAS.map((d) => (
          <Chip key={d} rotulo={`${d} km`} selecionado={km === d} onPress={() => setDistancia(String(d))} />
        ))}
      </View>
      <View style={styles.campos}>
        <View style={styles.campo}>
          <TextField rotulo="Distância (km)" value={distancia} onChangeText={setDistancia} keyboardType="decimal-pad" />
        </View>
        <View style={styles.campo}>
          <TextField rotulo="De (AAAA-MM-DD)" value={inicio} onChangeText={setInicio} />
        </View>
        <View style={styles.campo}>
          <TextField rotulo="Até" value={fim} onChangeText={setFim} />
        </View>
      </View>
      <Button titulo="Buscar corridas" variante="secundaria" onPress={() => void buscar()} carregando={buscando} />

      {candidatos && candidatos.length === 0 ? (
        <Text style={[tipografia.legenda, styles.texto]}>Nenhuma corrida de pelo menos {km} km no período.</Text>
      ) : null}
      {candidatos?.map((c) => {
        const chave = c.garminActivityId ?? `${c.data}-${c.distanciaKm}`;
        const trecho = c.garminActivityId ? trechos[c.garminActivityId] : undefined;
        return (
          <View key={chave} style={styles.linha}>
            <Text style={tipografia.corpoForte}>
              {formatarData(c.data)}/{c.data.slice(2, 4)} · {formatarKm(c.distanciaKm)} · {formatarDuracao(c.duracaoSegundos)}
            </Text>
            <Text style={tipografia.legenda}>
              {pace(c.duracaoSegundos, c.distanciaKm)} · {c.noApp ? 'no diário' : 'só no Garmin'}
            </Text>
            <View style={styles.acoes}>
              {c.inteira ? (
                <Button titulo={`Usar ${formatarDuracao(c.duracaoSegundos)}`} onPress={() => void salvar(c, c.duracaoSegundos, false)} />
              ) : null}
              {c.garminActivityId && trecho === undefined ? (
                <Button titulo={`Melhor ${km} km aqui`} variante="secundaria" onPress={() => void calcularTrecho(c)} />
              ) : null}
              {trecho === 'carregando' ? <Button titulo="Lendo..." variante="secundaria" carregando onPress={() => undefined} /> : null}
              {typeof trecho === 'number' ? (
                <Button titulo={`Usar trecho ${formatarDuracao(trecho)}`} onPress={() => void salvar(c, trecho, true)} />
              ) : null}
              {trecho === 'sem' ? <Text style={tipografia.legenda}>Sem dados de distância no arquivo.</Text> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  texto: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.xs },
  campos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginTop: espacamento.sm },
  campo: { flexGrow: 1, flexBasis: 100 },
  linha: { marginTop: espacamento.md, paddingTop: espacamento.sm, borderTopWidth: 1, borderTopColor: cores.borda },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginTop: espacamento.xs, alignItems: 'center' },
});
