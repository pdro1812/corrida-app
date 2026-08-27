import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

export type TipoBanner = 'sucesso' | 'erro' | 'aviso';

const CORES_POR_TIPO: Record<TipoBanner, { fundo: string; texto: string; emoji: string }> = {
  sucesso: { fundo: cores.sucessoFundo, texto: cores.sucesso, emoji: '✅' },
  erro: { fundo: cores.erroFundo, texto: cores.erro, emoji: '⚠️' },
  aviso: { fundo: cores.avisoFundo, texto: cores.aviso, emoji: 'ℹ️' },
};

// Substitui Alert.alert nas telas para feedback de sucesso/erro — Alert.alert
// não funciona no React Native Web (usado nos testes via `expo start --web`),
// e mesmo no Android nativo um banner fixo é mais fácil de reler.
export function Banner({
  tipo,
  titulo,
  mensagem,
  onFechar,
}: {
  tipo: TipoBanner;
  titulo: string;
  mensagem?: string;
  onFechar?: () => void;
}) {
  const paleta = CORES_POR_TIPO[tipo];
  return (
    <View style={[styles.banner, { backgroundColor: paleta.fundo }]}>
      <Text style={styles.emoji}>{paleta.emoji}</Text>
      <View style={styles.conteudo}>
        <Text style={[tipografia.corpoForte, { color: paleta.texto }]}>{titulo}</Text>
        {mensagem ? <Text style={[tipografia.legenda, styles.mensagem]}>{mensagem}</Text> : null}
      </View>
      {onFechar ? (
        <Pressable onPress={onFechar} hitSlop={8}>
          <Text style={[styles.fechar, { color: paleta.texto }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.md,
    gap: espacamento.sm,
  },
  emoji: { fontSize: 16, lineHeight: 20 },
  conteudo: { flex: 1 },
  mensagem: { marginTop: espacamento.xs / 2 },
  fechar: { fontSize: 16, fontWeight: '700', paddingHorizontal: espacamento.xs },
});
