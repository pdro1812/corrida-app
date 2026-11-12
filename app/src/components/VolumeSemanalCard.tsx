import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Card } from './Card';
import { formatarDuracaoCompacta, VolumeSemana } from '../utils/volumeSemanal';
import { formatarData, formatarKm } from '../utils/formato';
import { cores, espacamento, tipografia } from '../theme/theme';

const ALTURA = 170;
const MARGEM = { topo: 12, direita: 44, baixo: 26, esquerda: 8 };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const LARGURA_ROTULO_MES = 40;

// Topo do eixo y "redondo" em degraus de 10 km (mín. 30), com 3 linhas de
// grade: 0, metade e topo.
function topoDoEixo(maxKm: number): number {
  return Math.max(30, Math.ceil(maxKm / 10) * 10);
}

// Volume semanal das últimas semanas (linha + área), estilo "This week" do
// Strava: o cabeçalho mostra a semana selecionada (por padrão a atual) e
// tocar num ponto troca a seleção.
export function VolumeSemanalCard({ semanas }: { semanas: VolumeSemana[] }) {
  const [largura, setLargura] = useState(0);
  const [selecionada, setSelecionada] = useState(semanas.length - 1);
  const semana = semanas[selecionada] ?? semanas[semanas.length - 1];
  const ehAtual = selecionada === semanas.length - 1;

  const larguraPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita);
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.baixo;
  const topo = topoDoEixo(Math.max(...semanas.map((s) => s.km)));
  const passoX = semanas.length > 1 ? larguraPlot / (semanas.length - 1) : 0;
  const x = (i: number) => MARGEM.esquerda + i * passoX;
  const y = (km: number) => MARGEM.topo + alturaPlot * (1 - km / topo);
  const base = y(0);

  const linha = `M${semanas.map((s, i) => `${x(i)},${y(s.km)}`).join(' L')}`;
  const area = `${linha} L${x(semanas.length - 1)},${base} L${x(0)},${base} Z`;

  // Rótulo do mês na primeira semana que começa naquele mês (a 1ª semana
  // do gráfico fica sem rótulo — normalmente é um mês "cortado").
  const rotulosMes = semanas
    .map((s, i) => ({ i, mes: Number(s.inicio.slice(5, 7)) - 1 }))
    .filter(({ mes }, k, todos) => k > 0 && todos[k - 1].mes !== mes);

  return (
    <Card style={styles.card}>
      <Text style={tipografia.subtitulo}>
        {ehAtual ? 'Esta semana' : `Semana de ${formatarData(semana.inicio)}`}
      </Text>
      <View style={styles.metricas}>
        <Metrica rotulo="Distância" valor={formatarKm(semana.km)} />
        <Metrica rotulo="Tempo" valor={formatarDuracaoCompacta(semana.duracaoSegundos)} />
        <Metrica rotulo="Elevação" valor={`${Math.round(semana.elevacaoM)} m`} />
      </View>

      <Text style={[tipografia.legenda, styles.periodo]}>Últimas {semanas.length} semanas</Text>
      <View
        onLayout={(evento: LayoutChangeEvent) => setLargura(evento.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={`Volume semanal das últimas ${semanas.length} semanas: ${semanas
          .map((s) => `${formatarData(s.inicio)} ${s.km.toFixed(1)} km`)
          .join(', ')}`}
      >
        {largura > 0 ? (
          <Svg width={largura} height={ALTURA}>
            {[0, topo / 2, topo].map((valor) => (
              <Line
                key={`grade-${valor}`}
                x1={MARGEM.esquerda}
                x2={largura - MARGEM.direita + 6}
                y1={y(valor)}
                y2={y(valor)}
                stroke={cores.borda}
                strokeWidth={1}
              />
            ))}
            <Path d={area} fill={cores.primaria} fillOpacity={0.1} />
            <Path
              d={linha}
              fill="none"
              stroke={cores.primaria}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            <Line
              x1={x(selecionada)}
              x2={x(selecionada)}
              y1={MARGEM.topo}
              y2={base}
              stroke={cores.textoSecundario}
              strokeWidth={1}
            />
            {semanas.map((s, i) => (
              <Circle
                key={s.inicio}
                cx={x(i)}
                cy={y(s.km)}
                r={i === selecionada ? 6 : 4}
                fill={cores.primaria}
                stroke={cores.superficie}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : null}
        {/* Alvos de toque: a faixa vertical inteira de cada semana, bem maior
            que o ponto. Pressable do RN em vez de onPress no SVG (que no web
            gera avisos de props de responder). */}
        {largura > 0
          ? semanas.map((s, i) => (
              <Pressable
                key={`alvo-${s.inicio}`}
                onPress={() => setSelecionada(i)}
                accessibilityRole="button"
                accessibilityLabel={`Semana de ${formatarData(s.inicio)}: ${s.km.toFixed(1)} km`}
                style={[styles.alvo, { left: x(i) - Math.max(passoX, 24) / 2, width: Math.max(passoX, 24) }]}
              />
            ))
          : null}
        {/* Rótulos dos eixos como <Text> do RN (e não <text> do SVG): no web
            o SVG não herda a fonte do app e cai em serifada. */}
        {largura > 0
          ? [0, topo / 2, topo].map((valor) => (
              <Text
                key={`tick-${valor}`}
                style={[styles.rotuloEixo, { left: largura - MARGEM.direita + 10, top: y(valor) - 8 }]}
              >
                {`${valor} km`}
              </Text>
            ))
          : null}
        {largura > 0
          ? rotulosMes.map(({ i, mes }) => (
              <Text
                key={`mes-${i}`}
                style={[
                  styles.rotuloEixo,
                  styles.rotuloMes,
                  { left: x(i) - LARGURA_ROTULO_MES / 2, top: ALTURA - 18 },
                ]}
              >
                {MESES[mes]}
              </Text>
            ))
          : null}
      </View>
    </Card>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.metrica}>
      <Text style={tipografia.legenda}>{rotulo}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.md },
  metricas: { flexDirection: 'row', gap: espacamento.lg, marginTop: espacamento.sm },
  metrica: { gap: espacamento.xs / 2 },
  valor: { fontSize: 22, fontWeight: '700', color: cores.texto },
  periodo: { marginTop: espacamento.md, marginBottom: espacamento.xs },
  // pointerEvents none: os rótulos ficam por cima dos alvos de toque.
  rotuloEixo: { position: 'absolute', fontSize: 11, color: cores.textoSecundario, pointerEvents: 'none' },
  rotuloMes: { width: LARGURA_ROTULO_MES, textAlign: 'center' },
  alvo: { position: 'absolute', top: 0, height: ALTURA },
});
