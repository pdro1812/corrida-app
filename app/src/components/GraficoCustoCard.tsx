import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Card } from './Card';
import { TreinoAnalisado } from '../dominio/analise';
import { cores, espacamento, tipoTreino, tipografia } from '../theme/theme';

const ALTURA = 190;
const MARGEM = { topo: 14, direita: 36, baixo: 20, esquerda: 8 };

const corDoTipo = (tipo: string) => tipoTreino[tipo as keyof typeof tipoTreino]?.cor ?? cores.textoSecundario;

// Índice de custo (100 = típico) dos últimos treinos. Faixa 95-105 é o
// "normal"; acima, o treino custou mais do que costuma custar.
export function GraficoCustoCard({ treinos }: { treinos: TreinoAnalisado[] }) {
  const [largura, setLargura] = useState(0);
  const pontos = treinos.filter((t) => t.indice !== null).slice(-24);

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

  return (
    <Card style={styles.card}>
      <Text style={tipografia.subtitulo}>Custo de esforço</Text>
      <Text style={[tipografia.legenda, styles.legenda]}>
        Batimentos por km ajustados por subida e calor, contra a sua mediana no mesmo tipo de treino. 100 = típico.
      </Text>
      {pontos.length < 2 ? (
        <Text style={[tipografia.legenda, styles.vazio]}>
          Aparece depois de alguns treinos do mesmo tipo com FC (são precisos 3 de referência).
        </Text>
      ) : (
        <>
          <View style={styles.destaque}>
            <Text style={[styles.numero, { color: corDoIndice(ultimo.indice as number) }]}>{ultimo.indice}</Text>
            <Text style={tipografia.legenda}>último treino ({ultimo.treino.data.slice(8, 10)}/{ultimo.treino.data.slice(5, 7)})</Text>
          </View>
          <View onLayout={(e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width)}>
            {largura > 0 ? (
              <Svg width={largura} height={ALTURA}>
                <Defs>
                  <LinearGradient id="faixa" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={cores.primaria} stopOpacity={0.14} />
                    <Stop offset="1" stopColor={cores.primaria} stopOpacity={0.04} />
                  </LinearGradient>
                </Defs>
                <Path
                  d={`M${MARGEM.esquerda},${y(105)} H${MARGEM.esquerda + larguraPlot} V${y(95)} H${MARGEM.esquerda} Z`}
                  fill="url(#faixa)"
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
                  <Circle key={i} cx={x(i)} cy={y(p.indice as number)} r={4} fill={corDoTipo(p.tipo)} />
                ))}
              </Svg>
            ) : null}
          </View>
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
});
