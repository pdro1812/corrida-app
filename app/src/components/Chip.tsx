import { Pressable, StyleSheet, Text } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

interface Props {
  rotulo: string;
  selecionado: boolean;
  onPress: () => void;
}

export function Chip({ rotulo, selecionado, onPress }: Props) {
  return (
    <Pressable
      style={[styles.chip, selecionado && styles.chipSelecionado]}
      onPress={onPress}
    >
      <Text style={[styles.texto, selecionado && styles.textoSelecionado]}>{rotulo}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: espacamento.sm + 4,
    paddingVertical: espacamento.xs + 2,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  chipSelecionado: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  texto: { ...tipografia.legendaForte, color: cores.textoSecundario },
  textoSelecionado: { color: cores.textoClaro },
});
