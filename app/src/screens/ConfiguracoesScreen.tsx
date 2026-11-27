import { useCallback, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { TextField } from '../components/TextField';
import { Chip } from '../components/Chip';
import { SyncAutomaticoCard } from '../components/SyncAutomaticoCard';
import { gerarExportIa, lerLimiares, salvarLimiares } from '../services/exportIa';
import { obterChaveGarmin, removerChaveGarmin, salvarChaveGarmin } from '../services/configuracoes';
import { diagnosticarBemEstar, esquecerTokenGarmin, ultimaSincronizacao } from '../services/sync';
import { escolherArquivoTexto, salvarBackupNoCelular, salvarTextoNoCelular } from '../services/arquivos';
import { restaurarBackup, ResumoBackup } from '../services/backup';
import { espacamento, tipografia } from '../theme/theme';

type Mensagem = { tipo: 'sucesso' | 'erro'; titulo: string; mensagem?: string };

// v2: períodos do export para IA (semanas; null = tudo).
const PERIODOS_EXPORT: { rotulo: string; semanas: number | null }[] = [
  { rotulo: '4 semanas', semanas: 4 },
  { rotulo: '8 semanas', semanas: 8 },
  { rotulo: '12 semanas', semanas: 12 },
  { rotulo: 'Tudo', semanas: null },
];

const mensagemDeErro = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

const descreverResumo = (r: ResumoBackup) =>
  `${r.ciclos} ciclo(s) · ${r.treinosPrevistos} treino(s) previsto(s) · ${r.treinosRealizados} realizado(s)`;

export function ConfiguracoesScreen() {
  const [temChave, setTemChave] = useState(false);
  const [novaChave, setNovaChave] = useState('');
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'chave' | 'exportar' | 'restaurar' | 'ia' | 'diagnostico' | 'limiar' | null>(null);
  const [fcLimiar, setFcLimiar] = useState('');
  const [paceLimiar, setPaceLimiar] = useState('');
  const [semanasExport, setSemanasExport] = useState<number | null>(8);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const carregar = useCallback(async () => {
    setTemChave(Boolean(await obterChaveGarmin()));
    setUltimaSync(await ultimaSincronizacao());
    const limiares = await lerLimiares();
    setFcLimiar(limiares.fcLimiar ? String(limiares.fcLimiar) : '');
    setPaceLimiar(limiares.paceLimiar ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function salvarChave() {
    setOcupado('chave');
    setMensagem(null);
    try {
      await salvarChaveGarmin(novaChave);
      esquecerTokenGarmin();
      setNovaChave('');
      setMensagem({ tipo: 'sucesso', titulo: 'Chave da Garmin salva' });
      await carregar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', titulo: 'Não foi possível salvar a chave', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  function confirmarRemoverChave() {
    Alert.alert('Remover chave', 'A sincronização com a Garmin para até você colar uma chave nova.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          void removerChaveGarmin()
            .then(() => esquecerTokenGarmin())
            .then(carregar);
        },
      },
    ]);
  }

  async function exportar() {
    setOcupado('exportar');
    setMensagem(null);
    try {
      const salvo = await salvarBackupNoCelular();
      if (salvo) {
        setMensagem({ tipo: 'sucesso', titulo: `Backup salvo: ${salvo.nome}`, mensagem: descreverResumo(salvo.resumo) });
      }
    } catch (erro) {
      setMensagem({ tipo: 'erro', titulo: 'Não foi possível salvar o backup', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  async function gravarLimiares() {
    setOcupado('limiar');
    setMensagem(null);
    try {
      await salvarLimiares(fcLimiar, paceLimiar);
      setMensagem({ tipo: 'sucesso', titulo: 'Limiares salvos' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', titulo: 'Não foi possível salvar os limiares', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  // Compartilhar abre o menu do Android: dá para mandar direto ao app do
  // Claude ou copiar. Salvar grava um .md na pasta escolhida.
  async function exportarParaIa(modo: 'compartilhar' | 'salvar') {
    setOcupado('ia');
    setMensagem(null);
    try {
      const texto = await gerarExportIa(semanasExport);
      if (modo === 'compartilhar') {
        await Share.share({ title: 'Treinos para análise', message: texto });
      } else {
        const nome = `treinos-ia-${new Date().toISOString().slice(0, 10)}.md`;
        if (await salvarTextoNoCelular(nome, texto)) setMensagem({ tipo: 'sucesso', titulo: `Export salvo: ${nome}` });
      }
    } catch (erro) {
      setMensagem({ tipo: 'erro', titulo: 'Não foi possível gerar o export', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  // Mostra quais dados de saúde a chave libera (status + nomes de campos,
  // sem valores) para ajustar a leitura de sono/HRV/Body Battery.
  async function diagnosticar() {
    setOcupado('diagnostico');
    setMensagem(null);
    try {
      await Share.share({ title: 'Diagnóstico Garmin', message: await diagnosticarBemEstar() });
    } catch (erro) {
      setMensagem({ tipo: 'erro', titulo: 'Diagnóstico falhou', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  async function restaurar() {
    setOcupado('restaurar');
    setMensagem(null);
    try {
      // Qualquer tipo: um .json vindo do Drive/WhatsApp costuma chegar como
      // application/octet-stream e ficaria desabilitado no seletor. O
      // conteúdo é validado por inteiro em lerBackup antes de tocar no banco.
      const arquivo = await escolherArquivoTexto(['*/*']);
      if (!arquivo) return;
      const resumo = await restaurarBackup(arquivo.conteudo);
      setMensagem({ tipo: 'sucesso', titulo: 'Backup restaurado', mensagem: descreverResumo(resumo) });
    } catch (erro) {
      setMensagem({ tipo: 'erro', titulo: 'Não foi possível restaurar', mensagem: mensagemDeErro(erro) });
    } finally {
      setOcupado(null);
    }
  }

  function confirmarRestaurar() {
    Alert.alert(
      'Restaurar backup',
      'Todos os dados atuais do app serão substituídos pelos do arquivo. Isso não pode ser desfeito — exporte um backup antes, se quiser guardar o estado atual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Escolher arquivo', style: 'destructive', onPress: () => void restaurar() },
      ],
    );
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

      <Card style={styles.card}>
        <Text style={tipografia.subtitulo}>Garmin</Text>
        <Text style={[tipografia.legenda, styles.texto]}>
          {temChave ? 'Chave configurada ✓' : 'Nenhuma chave configurada'}
          {ultimaSync ? ` · última sincronização ${new Date(ultimaSync).toLocaleString('pt-BR')}` : ''}
        </Text>
        <Text style={[tipografia.legenda, styles.texto]}>
          Gere a chave em connect.garmin.com → Configurações → Personal API Token. Ela fica guardada
          criptografada no celular e expira (no máximo em 1 ano).
        </Text>
        <TextField
          rotulo={temChave ? 'Trocar chave' : 'Chave da Personal API'}
          value={novaChave}
          onChangeText={setNovaChave}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Cole a chave aqui"
        />
        <View style={styles.botoes}>
          <Button
            titulo="Salvar chave"
            onPress={() => void salvarChave()}
            carregando={ocupado === 'chave'}
            desabilitado={!novaChave.trim()}
          />
          {temChave ? (
            <Button
              titulo="Testar dados de saúde (sono, HRV...)"
              variante="secundaria"
              onPress={() => void diagnosticar()}
              carregando={ocupado === 'diagnostico'}
            />
          ) : null}
          {temChave ? <Button titulo="Remover chave" variante="perigo" onPress={confirmarRemoverChave} /> : null}
        </View>
      </Card>

      <SyncAutomaticoCard onAviso={setMensagem} />


      <Card style={styles.card}>
        <Text style={tipografia.subtitulo}>Limiares e resumo rápido</Text>
        <Text style={[tipografia.legenda, styles.texto]}>
          Os limiares definem as zonas de FC e de pace no banco de análise e no resumo. O resumo rápido gera o
          prompt + um JSON do período escolhido para colar direto numa conversa (melhor para poucas semanas).
        </Text>
        <View style={styles.chips}>
          <View style={styles.campoLimiar}>
            <TextField
              rotulo="FC de limiar (bpm)"
              value={fcLimiar}
              onChangeText={setFcLimiar}
              keyboardType="number-pad"
              placeholder="ex: 172"
            />
          </View>
          <View style={styles.campoLimiar}>
            <TextField
              rotulo="Pace de limiar (/km)"
              value={paceLimiar}
              onChangeText={setPaceLimiar}
              keyboardType="numbers-and-punctuation"
              placeholder="ex: 4:50"
            />
          </View>
        </View>
        <Button
          titulo="Salvar limiares"
          variante="secundaria"
          onPress={() => void gravarLimiares()}
          carregando={ocupado === 'limiar'}
        />
        <View style={styles.chips}>
          {PERIODOS_EXPORT.map((p) => (
            <Chip
              key={p.rotulo}
              rotulo={p.rotulo}
              selecionado={semanasExport === p.semanas}
              onPress={() => setSemanasExport(p.semanas)}
            />
          ))}
        </View>
        <View style={styles.botoes}>
          <Button
            titulo="Compartilhar / copiar"
            onPress={() => void exportarParaIa('compartilhar')}
            carregando={ocupado === 'ia'}
          />
          <Button titulo="Salvar arquivo .md" variante="secundaria" onPress={() => void exportarParaIa('salvar')} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={tipografia.subtitulo}>Backup</Text>
        <Text style={[tipografia.legenda, styles.texto]}>
          Os dados ficam só neste celular. Exporte um backup de vez em quando e guarde o arquivo (ex: na pasta
          Downloads ou no Google Drive). A chave da Garmin não vai no backup.
        </Text>
        <View style={styles.botoes}>
          <Button titulo="Exportar backup" onPress={() => void exportar()} carregando={ocupado === 'exportar'} />
          <Button
            titulo="Restaurar backup"
            variante="secundaria"
            onPress={confirmarRestaurar}
            carregando={ocupado === 'restaurar'}
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  texto: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  botoes: { gap: espacamento.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginBottom: espacamento.sm },
  campoLimiar: { flexGrow: 1, flexBasis: 140 },
});
