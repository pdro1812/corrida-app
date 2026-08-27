import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import * as DocumentPicker from 'expo-document-picker';
import { RootTabParamList } from '../types/navigation';
import { Ciclo } from '../types/api';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { buscarCicloAtivo } from '../services/ciclos';
import {
  excluirImportacao,
  Importacao,
  importarPlanilha,
  listarImportacoes,
  ResultadoImportacao,
} from '../services/import';
import { cores, espacamento, tipografia } from '../theme/theme';

type Props = BottomTabScreenProps<RootTabParamList, 'Importar'>;

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ImportarPlanilhaScreen({ navigation }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [arquivoAsset, setArquivoAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(
    null,
  );
  const [arquivoWeb, setArquivoWeb] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const cicloAtivo = await buscarCicloAtivo();
      setCiclo(cicloAtivo);
      setImportacoes(cicloAtivo ? await listarImportacoes(cicloAtivo.id) : []);
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

  async function escolherArquivo() {
    const resposta = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (resposta.canceled || resposta.assets.length === 0) {
      return;
    }
    setArquivoAsset(resposta.assets[0]);
    setArquivoWeb(resposta.output?.[0] ?? null);
    setArquivoNome(resposta.assets[0].name);
    setResultado(null);
  }

  async function importar() {
    if (!arquivoAsset || !ciclo) {
      return;
    }
    setImportando(true);
    setErro(null);
    try {
      const formData = new FormData();
      if (Platform.OS === 'web' && arquivoWeb) {
        formData.append('file', arquivoWeb, arquivoAsset.name);
      } else {
        formData.append('file', {
          uri: arquivoAsset.uri,
          name: arquivoAsset.name,
          type: arquivoAsset.mimeType ?? 'text/csv',
        } as unknown as Blob);
      }
      const resultadoImportacao = await importarPlanilha(ciclo.id, formData);
      setResultado(resultadoImportacao);
      await carregar();
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Tente novamente');
    } finally {
      setImportando(false);
    }
  }

  function confirmarExclusaoImportacao(importacao: Importacao) {
    Alert.alert(
      'Excluir importação',
      `Isso remove os ${importacao.treinosCriados} treino(s) criados por esta importação (as semanas continuam existindo, mesmo que fiquem vazias). Confirma?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            excluirImportacao(importacao.id)
              .then(() => carregar())
              .catch((erroCapturado) =>
                setErro(erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)),
              );
          },
        },
      ],
    );
  }

  if (carregando) {
    return <LoadingState />;
  }

  if (!ciclo) {
    return (
      <Screen>
        <EmptyState
          emoji="📄"
          titulo="Nenhum ciclo ativo"
          descricao="Crie um ciclo antes de importar a planilha de treinos."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {erro ? <Banner tipo="erro" titulo="Erro" mensagem={erro} onFechar={() => setErro(null)} /> : null}
      <Text style={[tipografia.corpo, styles.instrucoes]}>
        Escolha o CSV no formato &quot;longo&quot; (uma linha por treino) descrito em{' '}
        docs/ARCHITECTURE.md §4: semana, data, dia_semana, fase, tipo, descricao,
        distancia_alvo_km, pace_alvo_min, pace_alvo_max.
      </Text>

      <Button
        titulo={arquivoNome ?? 'Escolher arquivo CSV'}
        variante="secundaria"
        onPress={() => void escolherArquivo()}
      />

      {arquivoAsset ? (
        <View style={styles.botaoImportar}>
          <Button titulo="Importar" onPress={() => void importar()} carregando={importando} />
        </View>
      ) : null}

      {resultado ? (
        <Card style={styles.resultado}>
          <Text style={tipografia.subtitulo}>Importação concluída</Text>
          <Text style={tipografia.corpo}>{resultado.semanasCriadas} semana(s) criada(s)</Text>
          <Text style={tipografia.corpo}>
            {resultado.semanasReaproveitadas} semana(s) já existente(s)
          </Text>
          <Text style={tipografia.corpo}>{resultado.treinosCriados} treino(s) criado(s)</Text>
          {resultado.linhasComErro.length > 0 ? (
            <View style={styles.erros}>
              <Text style={[tipografia.corpoForte, { color: cores.erro }]}>
                {resultado.linhasComErro.length} linha(s) com erro:
              </Text>
              {resultado.linhasComErro.map((erro) => (
                <Text key={erro.linha} style={[tipografia.legenda, { color: cores.erro }]}>
                  Linha {erro.linha}: {erro.motivo}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.botaoImportar}>
            <Button titulo="Ver na Home" variante="secundaria" onPress={() => navigation.navigate('HomeTab')} />
          </View>
        </Card>
      ) : null}

      <Text style={styles.historicoTitulo}>Últimas importações</Text>
      {importacoes.length === 0 ? (
        <Text style={[tipografia.legenda, styles.semImportacoes]}>
          Nenhuma importação registrada pra este ciclo ainda.
        </Text>
      ) : (
        importacoes.map((importacao) => (
          <Card key={importacao.id} style={styles.linhaImportacao}>
            <View style={styles.linhaImportacaoTopo}>
              <Text style={tipografia.corpoForte}>
                {importacao.nomeArquivo ?? 'planilha.csv'}
              </Text>
              <Text style={tipografia.legenda}>{formatarDataHora(importacao.criadoEm)}</Text>
            </View>
            <Text style={tipografia.legenda}>
              {importacao.semanasCriadas} semana(s) · {importacao.treinosCriados} treino(s)
              {importacao.linhasComErro > 0 ? ` · ${importacao.linhasComErro} linha(s) com erro` : ''}
            </Text>
            <View style={styles.botaoExcluirImportacao}>
              <Button
                titulo="Excluir esta importação"
                variante="perigo"
                onPress={() => confirmarExclusaoImportacao(importacao)}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  instrucoes: { marginBottom: espacamento.md, color: cores.textoSecundario },
  botaoImportar: { marginTop: espacamento.md },
  resultado: { marginTop: espacamento.lg },
  erros: { marginTop: espacamento.sm, gap: espacamento.xs / 2 },
  historicoTitulo: { ...tipografia.legendaForte, marginTop: espacamento.lg, marginBottom: espacamento.sm },
  semImportacoes: { color: cores.textoSecundario },
  linhaImportacao: { marginBottom: espacamento.sm },
  linhaImportacaoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  botaoExcluirImportacao: { marginTop: espacamento.sm },
});
