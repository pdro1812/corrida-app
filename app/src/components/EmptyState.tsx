import { StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, tipografia } from '../theme/theme';

interface Props {
  emoji?: string;
  titulo: string;
  descricao?: string;
}

export function EmptyState({ emoji = '📭', titulo, descricao }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.titulo}>{titulo}</Text>
      {descricao ? <Text style={styles.descricao}>{descricao}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: espacamento.xl, gap: espacamento.xs },
  emoji: { fontSize: 40, marginBottom: espacamento.xs },
  titulo: { ...tipografia.corpoForte, textAlign: 'center' },
  descricao: {
    ...tipografia.legenda,
    textAlign: 'center',
    color: cores.textoSecundario,
    maxWidth: 260,
  },
});
