import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ciclo, Semana } from '../types/modelo';
import { BlocoCicloNovo, blocoDaData, posicaoNoBloco, ROTULO_TIPO_BLOCO, TIPOS_BLOCO, TipoBloco } from '../dominio/blocosCiclo';
import { atualizarBloco, BlocoCiclo, criarBloco, excluirBloco, gerarBlocosDoCiclo, listarBlocos } from '../services/blocosCiclo';
import { resumirBloco } from '../utils/blocosCiclo';
import { hojeLocal } from '../utils/dashboard';
import { formatarData, formatarKm } from '../utils/formato';
import { Card } from './Card';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { Banner } from './Banner';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

export const COR_BLOCO: Record<TipoBloco, string> = {
  pre_ciclo: '#94a3b8',
  base: '#22d3ee',
  desenvolvimento: '#a3e635',
  especifico: '#fbbf24',
  polimento: '#c084fc',
  transicao: '#64748b',
};

// Blocos do ciclo: linha do tempo, números de cada bloco e edição.
export function BlocosDoCiclo({ ciclo, semanas }: { ciclo: Ciclo; semanas: Semana[] }) {
  const [blocos, setBlocos] = useState<BlocoCiclo[]>([]);
  const [editando, setEditando] = useState<BlocoCiclo | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeLocal();

  const carregar = useCallback(async () => {
    setBlocos(await listarBlocos(ciclo.id));
  }, [ciclo.id]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function gerar(origem: 'fases' | 'padrao') {
    try {
      const n = await gerarBlocosDoCiclo(ciclo.id, origem);
      if (n === 0) setErro('As semanas da planilha não têm fase preenchida. Use a divisão padrão.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function confirmarExclusao(bloco: BlocoCiclo) {
    Alert.alert('Excluir bloco', `Remover "${bloco.nome}"? As semanas e treinos não mudam.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void excluirBloco(bloco.id).then(carregar) },
    ]);
  }

  const temFases = semanas.some((s) => s.fase?.trim());
  const atual = blocoDaData(blocos, hoje);

  return (
    <View>
      {erro ? <Banner tipo="erro" titulo="Blocos" mensagem={erro} onFechar={() => setErro(null)} /> : null}

      {blocos.length === 0 && editando === null ? (
        <Card style={styles.card}>
          <Text style={tipografia.subtitulo}>Divida o ciclo em blocos</Text>
          <Text style={[tipografia.legenda, styles.texto]}>
            Ex.: Base, Desenvolvimento, Específico e Polimento. As semanas entram no bloco pela data, e a análise compara
            os blocos entre si.
          </Text>
          <View style={styles.acoes}>
            {temFases ? <Button titulo="Usar as fases da planilha" onPress={() => void gerar('fases')} /> : null}
            <Button titulo="Divisão padrão" variante="secundaria" onPress={() => void gerar('padrao')} />
            <Button titulo="Criar manualmente" variante="secundaria" onPress={() => setEditando('novo')} />
          </View>
        </Card>
      ) : null}

      {blocos.length > 0 ? <LinhaDoTempo blocos={blocos} atualId={atual?.id ?? null} /> : null}

      {blocos.map((bloco) =>
        editando !== 'novo' && editando?.id === bloco.id ? (
          <FormularioBloco
            key={bloco.id}
            inicial={bloco}
            onSalvar={async (dados) => {
              await atualizarBloco(bloco.id, dados);
              setEditando(null);
              await carregar();
            }}
            onCancelar={() => setEditando(null)}
          />
        ) : (
          <CartaoBloco
            key={bloco.id}
            bloco={bloco}
            atual={atual?.id === bloco.id}
            semanas={semanas}
            hoje={hoje}
            onEditar={() => setEditando(bloco)}
            onExcluir={() => confirmarExclusao(bloco)}
          />
        ),
      )}

      {editando === 'novo' ? (
        <FormularioBloco
          inicial={{
            nome: '',
            tipo: 'base',
            dataInicio: blocos.length ? proximoDia(blocos[blocos.length - 1].dataFim) : ciclo.dataInicio.slice(0, 10),
            dataFim: ciclo.dataFim.slice(0, 10),
          }}
          onSalvar={async (dados) => {
            await criarBloco(ciclo.id, dados);
            setEditando(null);
            await carregar();
          }}
          onCancelar={() => setEditando(null)}
        />
      ) : blocos.length > 0 && editando === null ? (
        <Button titulo="+ Adicionar bloco" variante="secundaria" onPress={() => setEditando('novo')} />
      ) : null}
    </View>
  );
}

function proximoDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function LinhaDoTempo({ blocos, atualId }: { blocos: BlocoCiclo[]; atualId: string | null }) {
  return (
    <Card style={styles.card}>
      <View style={styles.timeline}>
        {blocos.map((b) => (
          <View
            key={b.id}
            style={[
              styles.segmento,
              { flex: Math.max(1, posicaoNoBloco(b, b.dataFim).total), backgroundColor: COR_BLOCO[b.tipo] },
              atualId === b.id && styles.segmentoAtual,
            ]}
          />
        ))}
      </View>
      <View style={styles.legenda}>
        {blocos.map((b) => (
          <Text key={b.id} style={[tipografia.legenda, { color: COR_BLOCO[b.tipo] }]}>
            ● {ROTULO_TIPO_BLOCO[b.tipo]} ({posicaoNoBloco(b, b.dataFim).total} sem)
          </Text>
        ))}
      </View>
    </Card>
  );
}

function CartaoBloco({
  bloco,
  atual,
  semanas,
  hoje,
  onEditar,
  onExcluir,
}: {
  bloco: BlocoCiclo;
  atual: boolean;
  semanas: Semana[];
  hoje: string;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const r = resumirBloco(bloco, semanas, hoje);
  const posicao = atual ? posicaoNoBloco(bloco, hoje) : null;
  const futuro = bloco.dataInicio > hoje;
  return (
    <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: COR_BLOCO[bloco.tipo] }, atual && styles.cardAtual]}>
      <Pressable onPress={onEditar} onLongPress={onExcluir}>
        <View style={styles.cabecalho}>
          <Text style={[tipografia.subtitulo, styles.flex]}>{bloco.nome}</Text>
          {posicao ? <Text style={styles.selo}>semana {posicao.atual} de {posicao.total}</Text> : null}
        </View>
        <Text style={tipografia.legenda}>
          {ROTULO_TIPO_BLOCO[bloco.tipo]} · {formatarData(bloco.dataInicio)} a {formatarData(bloco.dataFim)} · {r.semanas} semanas
        </Text>
        {bloco.objetivo ? <Text style={[tipografia.corpo, styles.texto]}>{bloco.objetivo}</Text> : null}
        {!futuro ? (
          <View style={styles.numeros}>
            <Numero rotulo="Km" valor={`${formatarKm(r.kmRealizado)} de ${formatarKm(r.kmPrevisto)}`} />
            <Numero rotulo="Treinos" valor={r.treinosElegiveis ? `${r.treinosFeitos}/${r.treinosElegiveis}` : '-'} />
            <Numero rotulo="Maior longão" valor={r.maiorLongaoKm ? formatarKm(r.maiorLongaoKm) : '-'} />
            <Numero rotulo="RPE médio" valor={r.rpeMedio !== null ? r.rpeMedio.toFixed(1) : '-'} />
          </View>
        ) : (
          <Text style={[tipografia.legenda, styles.texto]}>Previsto: {formatarKm(r.kmPrevisto)}</Text>
        )}
        <Text style={[tipografia.legenda, styles.dica]}>Toque para editar · segure para excluir</Text>
      </Pressable>
    </Card>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.numero}>
      <Text style={tipografia.legenda}>{rotulo}</Text>
      <Text style={tipografia.corpoForte}>{valor}</Text>
    </View>
  );
}

function FormularioBloco({
  inicial,
  onSalvar,
  onCancelar,
}: {
  inicial: BlocoCicloNovo;
  onSalvar: (dados: BlocoCicloNovo) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [tipo, setTipo] = useState<TipoBloco>(inicial.tipo);
  const [dataInicio, setDataInicio] = useState(inicial.dataInicio);
  const [dataFim, setDataFim] = useState(inicial.dataFim);
  const [objetivo, setObjetivo] = useState(inicial.objetivo ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar({ nome: nome || ROTULO_TIPO_BLOCO[tipo], tipo, dataInicio, dataFim, objetivo });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card style={styles.card}>
      {erro ? <Banner tipo="erro" titulo="Não foi possível salvar" mensagem={erro} onFechar={() => setErro(null)} /> : null}
      <View style={styles.chips}>
        {TIPOS_BLOCO.map((t) => (
          <Chip key={t} rotulo={ROTULO_TIPO_BLOCO[t]} selecionado={tipo === t} onPress={() => setTipo(t)} />
        ))}
      </View>
      <TextField rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Bloco 2 - Desenvolvimento" />
      <View style={styles.campos}>
        <View style={styles.flex}>
          <TextField rotulo="Início (AAAA-MM-DD)" value={dataInicio} onChangeText={setDataInicio} />
        </View>
        <View style={styles.flex}>
          <TextField rotulo="Fim (AAAA-MM-DD)" value={dataFim} onChangeText={setDataFim} />
        </View>
      </View>
      <TextField
        rotulo="Objetivo do bloco (opcional)"
        value={objetivo}
        onChangeText={setObjetivo}
        multiline
        placeholder="Ex.: subir volume até 70 km, longão até 28 km"
      />
      <View style={styles.acoes}>
        <Button titulo="Salvar" onPress={() => void salvar()} carregando={salvando} />
        <Button titulo="Cancelar" variante="secundaria" onPress={onCancelar} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: espacamento.sm },
  cardAtual: { borderColor: cores.primaria, borderWidth: 1.5 },
  texto: { marginTop: espacamento.xs },
  dica: { marginTop: espacamento.sm, fontSize: 11 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm, marginTop: espacamento.sm },
  timeline: { flexDirection: 'row', height: 14, borderRadius: raio.pill, overflow: 'hidden', gap: 2 },
  segmento: { height: '100%', opacity: 0.55 },
  segmentoAtual: { opacity: 1 },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', columnGap: espacamento.md, marginTop: espacamento.sm },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  flex: { flex: 1 },
  selo: { ...tipografia.legendaForte, color: cores.primaria },
  numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.md, marginTop: espacamento.sm },
  numero: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.xs, marginBottom: espacamento.sm },
  campos: { flexDirection: 'row', gap: espacamento.sm },
});
