import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from './Card';
import { Button } from './Button';
import { TextField } from './TextField';
import { criarRecorde, excluirRecorde, listarRecordes, RecordePessoal } from '../services/recordes';
import { gerarArquivoAnalise, lerObservacoes, salvarObservacoes } from '../services/exportAnalise';
import { salvarBytesNoCelular } from '../services/arquivos';
import { formatarDuracao } from '../utils/formato';
import { espacamento, tipografia } from '../theme/theme';

type Aviso = { tipo: 'sucesso' | 'erro'; titulo: string; mensagem?: string };

const mensagemDeErro = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

// Perfil que acompanha o banco de análise (recordes e observações) e o
// botão que gera o arquivo .db para a IA consultar.
export function PerfilAnaliseCard({ onAviso }: { onAviso: (aviso: Aviso) => void }) {
  const [recordes, setRecordes] = useState<RecordePessoal[]>([]);
  const [distancia, setDistancia] = useState('');
  const [tempo, setTempo] = useState('');
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [ocupado, setOcupado] = useState<'recorde' | 'obs' | 'db' | null>(null);

  const carregar = useCallback(async () => {
    setRecordes(await listarRecordes());
    setObservacoes(await lerObservacoes());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function adicionarRecorde() {
    setOcupado('recorde');
    try {
      await criarRecorde({ distanciaKm: distancia, tempo, data, descricao });
      setDistancia('');
      setTempo('');
      setData('');
      setDescricao('');
      setRecordes(await listarRecordes());
    } catch (erro) {
      onAviso({ tipo: 'erro', titulo: 'Não foi possível salvar o recorde', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  async function remover(id: string) {
    await excluirRecorde(id);
    setRecordes(await listarRecordes());
  }

  async function gravarObservacoes() {
    setOcupado('obs');
    try {
      await salvarObservacoes(observacoes);
      onAviso({ tipo: 'sucesso', titulo: 'Observações salvas' });
    } catch (erro) {
      onAviso({ tipo: 'erro', titulo: 'Não foi possível salvar', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  async function exportarBanco() {
    setOcupado('db');
    try {
      const { bytes, resumo, pendentes } = await gerarArquivoAnalise();
      const nome = `corrida-analise-${new Date().toISOString().slice(0, 10)}.db`;
      if (await salvarBytesNoCelular(nome, bytes, 'application/vnd.sqlite3')) {
        onAviso({
          tipo: 'sucesso',
          titulo: `Banco salvo: ${nome}`,
          mensagem:
            `${resumo.treinos} treino(s), ${resumo.dias} dia(s) de recuperação, ${resumo.blocos} bloco(s).` +
            (pendentes > 0
              ? ` Ainda faltam ${pendentes} treino(s) para analisar: sincronize de novo e gere outro arquivo.`
              : ''),
        });
      }
    } catch (erro) {
      onAviso({ tipo: 'erro', titulo: 'Não foi possível gerar o banco', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={tipografia.subtitulo}>Análise pelo Claude</Text>
      <Text style={[tipografia.legenda, styles.texto]}>
        Gera um arquivo SQLite (.db) com todo o histórico organizado para consulta: recuperação diária, treino
        proposto, treino executado por bloco, tiros, km a km, provas, recordes e este perfil. Sem criptografia,
        localização ou chave da Garmin. Coloque o arquivo na pasta do projeto para a análise.
      </Text>

      <Text style={tipografia.legendaForte}>Recordes pessoais</Text>
      {recordes.length === 0 ? <Text style={[tipografia.legenda, styles.texto]}>Nenhum recorde cadastrado.</Text> : null}
      {recordes.map((r) => (
        <View key={r.id} style={styles.linha}>
          <Text style={[tipografia.corpo, styles.flex]}>
            {r.distanciaKm} km · {formatarDuracao(r.tempoSegundos)}
            {r.data ? ` · ${r.data}` : ''}
            {r.descricao ? ` · ${r.descricao}` : ''}
          </Text>
          <Button titulo="Excluir" variante="perigo" onPress={() => void remover(r.id)} />
        </View>
      ))}
      <View style={styles.campos}>
        <View style={styles.campo}>
          <TextField rotulo="Distância (km)" value={distancia} onChangeText={setDistancia} keyboardType="decimal-pad" placeholder="21.1" />
        </View>
        <View style={styles.campo}>
          <TextField rotulo="Tempo" value={tempo} onChangeText={setTempo} keyboardType="numbers-and-punctuation" placeholder="1:45:30" />
        </View>
        <View style={styles.campo}>
          <TextField rotulo="Data (opcional)" value={data} onChangeText={setData} placeholder="2026-05-10" />
        </View>
        <View style={styles.campo}>
          <TextField rotulo="Prova (opcional)" value={descricao} onChangeText={setDescricao} placeholder="Meia de POA" />
        </View>
      </View>
      <Button
        titulo="Adicionar recorde"
        variante="secundaria"
        onPress={() => void adicionarRecorde()}
        carregando={ocupado === 'recorde'}
        desabilitado={!distancia.trim() || !tempo.trim()}
      />

      <View style={styles.bloco}>
        <TextField
          rotulo="Observações para a análise (lesões, rotina, objetivos)"
          value={observacoes}
          onChangeText={setObservacoes}
          multiline
          placeholder="Ex: corro 5x por semana, musculação seg/qua, canelite em 2025"
        />
        <Button titulo="Salvar observações" variante="secundaria" onPress={() => void gravarObservacoes()} carregando={ocupado === 'obs'} />
      </View>

      <View style={styles.bloco}>
        <Button titulo="Exportar banco para análise (.db)" onPress={() => void exportarBanco()} carregando={ocupado === 'db'} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  texto: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm, marginBottom: espacamento.xs },
  flex: { flex: 1 },
  campos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginTop: espacamento.sm },
  campo: { flexGrow: 1, flexBasis: 140 },
  bloco: { marginTop: espacamento.md },
});
