import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme/theme';

type Variante = 'primaria' | 'secundaria' | 'perigo';

interface Props {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  carregando?: boolean;
  desabilitado?: boolean;
}

export function Button({
  titulo,
  onPress,
  variante = 'primaria',
  carregando = false,
  desabilitado = false,
}: Props) {
  const estilos = ESTILOS_POR_VARIANTE[variante];

  return (
    <Pressable
      style={[styles.base, estilos.container, (desabilitado || carregando) && styles.desabilitado]}
      onPress={onPress}
      disabled={desabilitado || carregando}
    >
      {carregando ? (
        <ActivityIndicator color={estilos.texto.color} />
      ) : (
        <Text style={[styles.texto, estilos.texto]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const ESTILOS_POR_VARIANTE = {
  primaria: StyleSheet.create({
    container: {
      backgroundColor: cores.primaria,
      ...Platform.select({
        web: { boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)' },
        default: {
          shadowColor: cores.primariaEscura,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 2,
        },
      }),
    },
    texto: { color: cores.textoClaro },
  }),
  secundaria: StyleSheet.create({
    container: {
      backgroundColor: cores.superficie,
      borderWidth: 1.5,
      borderColor: cores.primaria,
    },
    texto: { color: cores.primaria },
  }),
  perigo: StyleSheet.create({
    container: {
      backgroundColor: cores.superficie,
      borderWidth: 1.5,
      borderColor: cores.erro,
    },
    texto: { color: cores.erro },
  }),
};

const styles = StyleSheet.create({
  base: {
    borderRadius: raio.md,
    paddingVertical: espacamento.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { ...tipografia.corpoForte, fontSize: 15 },
  desabilitado: { opacity: 0.5 },
});
