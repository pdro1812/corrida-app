import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio } from '../theme/theme';

// Barra de seleção no topo das abas que juntam mais de uma tela.
export function Segmentos<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onChange: (valor: T) => void;
}) {
  return (
    <View style={styles.barra} accessibilityRole="tablist">
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === valor;
        return (
          <Pressable
            key={opcao.valor}
            onPress={() => onChange(opcao.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            style={[styles.opcao, ativo && styles.ativo]}
          >
            <Text style={[styles.texto, ativo && styles.textoAtivo]}>{opcao.rotulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    backgroundColor: cores.superficie,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 3,
    marginHorizontal: espacamento.md,
    marginTop: espacamento.sm,
  },
  opcao: { flex: 1, paddingVertical: espacamento.xs + 2, borderRadius: raio.pill, alignItems: 'center' },
  ativo: { backgroundColor: cores.primaria },
  texto: { fontSize: 13, fontWeight: '600', color: cores.textoSecundario },
  textoAtivo: { color: cores.fundo },
});
