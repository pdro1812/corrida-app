import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

interface Props extends TextInputProps {
  rotulo: string;
  erro?: string;
}

export function TextField({ rotulo, erro, style, ...props }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput
        style={[styles.input, erro && styles.inputComErro, style]}
        placeholderTextColor={cores.neutro}
        {...props}
      />
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: espacamento.md },
  rotulo: { ...tipografia.legendaForte, marginBottom: espacamento.xs },
  input: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    paddingHorizontal: espacamento.sm + 4,
    paddingVertical: espacamento.sm + 2,
    fontSize: 15,
    color: cores.texto,
    backgroundColor: cores.superficie,
  },
  inputComErro: { borderColor: cores.erro },
  erro: { ...tipografia.legenda, color: cores.erro, marginTop: espacamento.xs },
});
