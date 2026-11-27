import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Card } from './Card';
import { tendenciaCusto, TreinoAnalisado } from '../dominio/analise';
import { ajustesDoCusto } from '../dominio/custoEsforco';
import { hojeLocal } from '../utils/dashboard';
import { cores, espacamento, tipoTreino, tipografia } from '../theme/theme';

const ALTURA = 190;
const MARGEM = { topo: 14, direita: 36, baixo: 20, esquerda: 8 };

const corDoTipo = (tipo: string) => tipoTreino[tipo as keyof typeof tipoTreino]?.cor ?? cores.textoSecundario;

// Índice de custo (100 = típico) dos últimos treinos. Faixa 95-105 é o
// "normal"; abaixo, custou menos que o normal; acima, custou mais.
// Tocar num ponto mostra a conta daquele treino.
export function GraficoCustoCard({ treinos }: { treinos: TreinoAnalisado[] }) {
  const [largura, setLargura] = useState(0);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const pontos = treinos.filter((t) => t.indice !== null).slice(-24);
  const tendencia = tendenciaCusto(treinos, hojeLocal());

  const larguraPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita);
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.baixo;
  const valores = pontos.map((p) => p.indice as number);
  const minimo = Math.min(85, ...valores);
  const maximo = Math.max(115, ...valores);
  const passoX = pontos.length > 1 ? larguraPlot / (pontos.length - 1) : 0;
  const x = (i: number) => MARGEM.esquerda + i * passoX;
  const y = (v: number) => MARGEM.topo + alturaPlot * (1 - (v - minimo) / (maximo - minimo));
  const linha = pontos.length ? `M${pontos.map((p, i) => `${x(i)},${y(p.indice as number)}`).join(' L')}` : '';
  const ultimo = pontos[pontos.length - 1];
  const foco = selecionado !== null && pontos[selecionado] ? pontos[selecionado] : ultimo;

  return (
    <Card style={styles.card}>
      <Text style={tipografia.subtitulo}>Custo de esforço</Text>
      <Text style={[tipografia.corpo, styles.legenda]}>
        Quantos batimentos você gastou para cada km, comparado com os seus treinos anteriores do mesmo tipo. 100 = o seu
        normal. Abaixo de 100 o treino custou menos que o normal (bom sinal); acima, custou mais (cansaço, calor, sono
        ruim, ritmo acima do habitual).
      </Text>
      {pontos.length < 2 ? (
        <Text style={[tipografia.legenda, styles.vazio]}>
          Aparece depois de alguns treinos do mesmo tipo com FC (são precisos 3 de referência).
        </Text>
      ) : (
        <>
          <View style={styles.destaque}>
            <Text style={[styles.numero, { color: corDoIndice(foco.indice as number) }]}>{foco.indice}</Text>
            <Text style={tipografia.legenda}>
              {foco === ultimo ? 'último treino' : 'treino'} ({foco.treino.data.slice(8, 10)}/{foco.treino.data.slice(5, 7)}) ·{' '}
              {rotuloDoIndice(foco.indice as number)}
            </Text>
          </View>
          {tendencia ? (
            <Text style={[tipografia.legendaForte, { color: tendencia.variacaoPct <= 0 ? cores.sucesso : cores.aviso }]}>
              {tendencia.variacaoPct === 0
                ? 'Custo estável nas últimas 4 semanas'
                : `Custo ${tendencia.variacaoPct < 0 ? 'caindo' : 'subindo'} ${Math.abs(tendencia.variacaoPct)}% nas últimas 4 semanas` +
                  (tendencia.variacaoPct < 0 ? ' (mais eficiente)' : '')}
            </Text>
          ) : null}
          <View onLayout={(e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width)}>
            {largura > 0 ? (
              <Svg width={largura} height={ALTURA}>
                <Path
                  d={`M${MARGEM.esquerda},${y(maximo)} H${MARGEM.esquerda + larguraPlot} V${y(105)} H${MARGEM.esquerda} Z`}
                  fill={cores.aviso}
                  fillOpacity={0.08}
                />
                <Path
                  d={`M${MARGEM.esquerda},${y(105)} H${MARGEM.esquerda + larguraPlot} V${y(95)} H${MARGEM.esquerda} Z`}
                  fill={cores.primaria}
                  fillOpacity={0.08}
                />
                <Path
                  d={`M${MARGEM.esquerda},${y(95)} H${MARGEM.esquerda + larguraPlot} V${y(minimo)} H${MARGEM.esquerda} Z`}
                  fill={cores.sucesso}
                  fillOpacity={0.08}
                />
                <Line
                  x1={MARGEM.esquerda}
                  x2={MARGEM.esquerda + larguraPlot}
                  y1={y(100)}
                  y2={y(100)}
                  stroke={cores.borda}
                  strokeDasharray="4 4"
                />
                <SvgText x={largura - 4} y={y(100) + 4} fill={cores.textoSecundario} fontSize={11} textAnchor="end">
                  100
                </SvgText>
                <Path d={linha} stroke={cores.primaria} strokeWidth={2} fill="none" strokeOpacity={0.5} />
                {pontos.map((p, i) => (
                  <Circle
                    key={i}
                    cx={x(i)}
                    cy={y(p.indice as number)}
                    r={p === foco ? 6 : 4}
                    fill={corDoTipo(p.tipo)}
                    stroke={p === foco ? cores.texto : 'none'}
                    strokeWidth={1.5}
                  />
                ))}
              </Svg>
            ) : null}
            {/* Áreas de toque por ponto (o Svg não recebe toque confiável no Android). */}
            {largura > 0 ? (
              <View style={StyleSheet.absoluteFill}>
                {pontos.map((p, i) => (
                  <Pressable
                    key={i}
                    accessibilityLabel={`Treino de ${p.treino.data}, índice ${p.indice}`}
                    onPress={() => setSelecionado(i)}
                    style={{
                      position: 'absolute',
                      left: x(i) - Math.max(10, passoX / 2),
                      width: Math.max(20, passoX),
                      top: 0,
                      bottom: 0,
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>
          <ContaDoTreino ponto={foco} />
          <View style={styles.tipos}>
            {Object.entries(tipoTreino)
              .filter(([tipo]) => pontos.some((p) => p.tipo === tipo))
              .map(([tipo, estilo]) => (
                <View key={tipo} style={styles.tipo}>
                  <View style={[styles.ponto, { backgroundColor: estilo.cor }]} />
                  <Text style={tipografia.legenda}>{tipo}</Text>
                </View>
              ))}
          </View>
        </>
      )}
    </Card>
  );
}

function rotuloDoIndice(indice: number): string {
  if (indice < 95) return `custou ${100 - indice}% menos que o normal`;
  if (indice <= 105) return 'dentro do normal';
  return `custou ${indice - 100}% mais que o normal`;
}

// A conta do treino selecionado, passo a passo.
function ContaDoTreino({ ponto }: { ponto: TreinoAnalisado }) {
  const t = ponto.treino;
  const ajustes = ajustesDoCusto(t);
  return (
    <View style={styles.conta}>
      <Text style={tipografia.legendaForte}>
        Como saiu o {ponto.indice} ({t.descricaoPrevista ?? ponto.tipo}, {t.data.slice(8, 10)}/{t.data.slice(5, 7)})
      </Text>
      <Text style={tipografia.legenda}>
        1. FC média {t.fcMedia ?? '-'} bpm × {t.paceMedio ?? '-'} min/km = {ponto.custo.batimentosPorKm ?? '-'} batimentos por km
      </Text>
      <Text style={tipografia.legenda}>
        2. Desconta subida ({ajustes.subidaMPorKm} m/km, -{ajustes.subidaPct}%) e calor (
        {t.temperaturaC !== null ? `${Math.round(t.temperaturaC)} °C` : 'sem clima'}, -{ajustes.calorPct}%) ={' '}
        {ponto.custo.batimentosPorKmAjustado ?? '-'} por km
      </Text>
      <Text style={tipografia.legenda}>
        3. Seu normal em {ponto.tipo === 'sem_plano' ? 'treinos sem plano' : ponto.tipo}: {Math.round(ponto.referencia ?? 0)} por km
        (mediana de {ponto.nReferencia} treinos anteriores)
      </Text>
      <Text style={tipografia.legenda}>
        4. {ponto.custo.batimentosPorKmAjustado ?? '-'} ÷ {Math.round(ponto.referencia ?? 0)} × 100 = {ponto.indice}
      </Text>
      <Text style={[tipografia.legenda, styles.dica]}>Toque em outro ponto para ver a conta dele.</Text>
    </View>
  );
}

export function corDoIndice(indice: number): string {
  if (indice <= 95) return cores.sucesso;
  if (indice <= 105) return cores.primaria;
  if (indice <= 112) return cores.aviso;
  return cores.erro;
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  legenda: { marginTop: espacamento.xs, marginBottom: espacamento.sm },
  vazio: { paddingVertical: espacamento.md },
  destaque: { flexDirection: 'row', alignItems: 'baseline', gap: espacamento.sm, marginBottom: espacamento.xs },
  numero: { fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.md, marginTop: espacamento.xs },
  tipo: { flexDirection: 'row', alignItems: 'center', gap: espacamento.xs },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  conta: {
    marginTop: espacamento.md,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    gap: espacamento.xs,
  },
  dica: { fontSize: 11 },
});
