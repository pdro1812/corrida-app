import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { textoPrevistoParaCopiar } from '../utils/textoPrevisto';
import { cores, espacamento, raio } from '../theme/theme';

// Copia "P: <previsto>" para colar na descrição da atividade.
export function CopiarPrevisto({ descricao }: { descricao: string | null | undefined }) {
  const [copiado, setCopiado] = useState(false);
  const texto = textoPrevistoParaCopiar(descricao);

  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(timer);
  }, [copiado]);

  if (!texto) return null;

  async function copiar() {
    if (!texto) return;
    await Clipboard.setStringAsync(texto);
    setCopiado(true);
  }

  return (
    <Pressable
      onPress={() => void copiar()}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Copiar previsto"
      style={[styles.botao, copiado && styles.ativo]}
    >
      <Ionicons name={copiado ? 'checkmark' : 'copy-outline'} size={16} color={copiado ? cores.sucesso : cores.primaria} />
      <Text style={[styles.texto, copiado && { color: cores.sucesso }]}>{copiado ? 'Copiado' : 'Copiar'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.pill,
    paddingHorizontal: espacamento.sm,
    paddingVertical: espacamento.xs / 2,
  },
  ativo: { borderColor: cores.sucesso },
  texto: { fontSize: 12, fontWeight: '600', color: cores.primaria },
});
