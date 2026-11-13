import { PropsWithChildren } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { cores, espacamento, raio } from '../theme/theme';

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.md,
    borderWidth: 1,
    borderColor: cores.borda,
    ...Platform.select({
      web: { boxShadow: '0 0 0 1px rgba(34, 211, 238, 0.04), 0 8px 24px rgba(0, 0, 0, 0.45)' },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },
});
