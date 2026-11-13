import { useCallback, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { analisarTreinos, calcularProntidao, Prontidao, TreinoAnalisado } from '../dominio/analise';
import { descreverTempo } from '../dominio/clima';
import { carregarTreinosParaAnalise, gerarExportIa } from '../services/exportIa';
import { listarBemEstar } from '../services/bemEstar';
import { somarDias } from '../services/linhas';
import { formatarData, formatarKm } from '../utils/formato';
import { corDoRpe } from '../utils/resumoTreinos';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { LoadingState } from '../components/LoadingState';
import { corDoIndice, GraficoCustoCard } from '../components/GraficoCustoCard';
import { cores, espacamento, numeroPainel, raio, tipografia } from '../theme/theme';

// v2: painel de análise — prontidão (sono, HRV, FC de repouso, Body
// Battery), custo de esforço ao longo do tempo e os últimos treinos com
// clima, deriva cardíaca e RPE. Também gera o export para o Claude.
export function LabScreen() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [treinos, setTreinos] = useState<TreinoAnalisado[]>([]);
  const [prontidao, setProntidao] = useState<Prontidao | null>(null);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      // 6 meses de histórico dão referência para o índice de custo.
      setTreinos(analisarTreinos(await carregarTreinosParaAnalise(somarDias(hoje, -180))));
      setProntidao(calcularProntidao(await listarBemEstar(somarDias(hoje, -14))));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function exportar() {
    setExportando(true);
    try {
      await Share.share({ title: 'Treinos para análise', message: await gerarExportIa(8) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  }

  if (carregando) return <LoadingState />;
  const recentes = [...treinos].reverse().slice(0, 12);

  return (
    <Screen scroll>
      {erro ? <Banner tipo="erro" titulo="Erro ao carregar" mensagem={erro} onFechar={() => setErro(null)} /> : null}

      <Card style={styles.card}>
        <Text style={tipografia.subtitulo}>Prontidão</Text>
        {prontidao?.data ? (
          <>
            <Text style={[tipografia.legenda, styles.legenda]}>
              {formatarData(prontidao.data)} · comparado com a sua média dos 7 dias anteriores
            </Text>
            <View style={styles.grade}>
              <Indicador rotulo="Sono" valor={prontidao.sonoHoras !== null ? `${prontidao.sonoHoras}h` : '–'} />
              <Indicador
                rotulo="HRV"
                valor={prontidao.hrvNoite !== null ? `${prontidao.hrvNoite}` : '–'}
                detalhe={variacao(prontidao.hrvVariacaoPct, '%')}
                cor={prontidao.hrvVariacaoPct !== null && prontidao.hrvVariacaoPct <= -10 ? cores.erro : undefined}
              />
              <Indicador
                rotulo="FC repouso"
                valor={prontidao.fcRepouso !== null ? `${prontidao.fcRepouso}` : '–'}
                detalhe={variacao(prontidao.fcRepousoVariacao, ' bpm')}
                cor={prontidao.fcRepousoVariacao !== null && prontidao.fcRepousoVariacao >= 5 ? cores.erro : undefined}
              />
              <Indicador
                rotulo="Body Battery"
                valor={prontidao.bodyBatteryMax !== null ? `${prontidao.bodyBatteryMax}` : '–'}
              />
            </View>
          </>
        ) : (
          <Text style={[tipografia.legenda, styles.legenda]}>
            Sem dados de sono/HRV ainda. Eles chegam no próximo sync; se não aparecerem, use &quot;Testar dados de
            saúde&quot; em Configurações.
          </Text>
        )}
      </Card>

      <GraficoCustoCard treinos={treinos} />

      <Card style={styles.card}>
        <Text style={tipografia.subtitulo}>Últimos treinos</Text>
        {recentes.length === 0 ? (
          <Text style={[tipografia.legenda, styles.legenda]}>Nenhum treino nos últimos 6 meses.</Text>
        ) : (
          recentes.map(({ treino: t, indice, tipo }) => (
            <View key={`${t.data}-${t.duracaoSegundos}-${t.distanciaKm}`} style={styles.linha}>
              <View style={styles.linhaTopo}>
                <Text style={tipografia.corpoForte}>
                  {formatarData(t.data)} · {formatarKm(t.distanciaKm)}
                  {t.paceMedio ? ` · ${t.paceMedio}/km` : ''}
                </Text>
                {indice !== null ? (
                  <View style={[styles.badge, { borderColor: corDoIndice(indice) }]}>
                    <Text style={[styles.badgeTexto, { color: corDoIndice(indice) }]}>{indice}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={tipografia.legenda}>
                {[
                  tipo !== 'sem_plano' ? tipo : null,
                  t.fcMedia ? `FC ${t.fcMedia}` : null,
                  t.desacoplamentoPct !== null ? `deriva ${t.desacoplamentoPct}%` : null,
                  t.temperaturaC !== null ? `${Math.round(t.temperaturaC)}°C` : null,
                  t.umidadePct !== null ? `${Math.round(t.umidadePct)}% umid.` : null,
                  descreverTempo(t.codigoTempo),
                  t.cadenciaPpm ? `${t.cadenciaPpm} ppm` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {t.rpe !== null ? (
                <Text style={[styles.rpe, { color: corDoRpe(t.rpe) }]}>RPE {t.rpe}</Text>
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Button titulo="Mandar para o Claude (8 semanas)" onPress={() => void exportar()} carregando={exportando} />
      <Text style={[tipografia.legenda, styles.rodape]}>
        Outros períodos e salvar como arquivo: Configurações → Exportar para o Claude.
      </Text>
    </Screen>
  );
}

function variacao(valor: number | null, unidade: string): string | undefined {
  if (valor === null) return undefined;
  return `${valor > 0 ? '+' : ''}${valor}${unidade}`;
}

function Indicador({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <View style={styles.indicador}>
      <Text style={styles.indicadorRotulo}>{rotulo.toUpperCase()}</Text>
      <Text style={[numeroPainel, styles.indicadorValor]}>{valor}</Text>
      {detalhe ? <Text style={[tipografia.legendaForte, { color: cor ?? cores.textoSecundario }]}>{detalhe}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  legenda: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  indicador: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: cores.superficieElevada,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espacamento.sm + 4,
  },
  indicadorRotulo: { ...tipografia.legendaForte, fontSize: 11, letterSpacing: 1.2 },
  indicadorValor: { fontSize: 28, marginTop: 2 },
  linha: { paddingVertical: espacamento.sm, borderBottomWidth: 1, borderBottomColor: cores.borda, gap: 2 },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderWidth: 1.5, borderRadius: raio.pill, paddingHorizontal: espacamento.sm, paddingVertical: 1 },
  badgeTexto: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rpe: { fontSize: 12, fontWeight: '700' },
  rodape: { textAlign: 'center', marginTop: espacamento.sm, marginBottom: espacamento.lg },
});
