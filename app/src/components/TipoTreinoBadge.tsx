import { StyleSheet, Text, View } from 'react-native';
import { TipoTreino } from '../types/api';
import { espacamento, raio, tipoTreino, tipografia } from '../theme/theme';

const ROTULOS: Record<TipoTreino, string> = {
  rodagem: 'Rodagem',
  qualidade: 'Qualidade',
  longo: 'Longo',
  descanso: 'Descanso',
};

export function TipoTreinoBadge({ tipo }: { tipo: TipoTreino | null }) {
  if (!tipo) {
    return null;
  }
  const paleta = tipoTreino[tipo];
  return (
    <View style={[styles.badge, { backgroundColor: paleta.fundo }]}>
      <Text style={styles.emoji}>{paleta.emoji}</Text>
      <Text style={[tipografia.legendaForte, { color: paleta.cor }]}>{ROTULOS[tipo]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    paddingVertical: espacamento.xs / 2 + 1,
    borderRadius: raio.pill,
  },
  emoji: { fontSize: 12 },
});
