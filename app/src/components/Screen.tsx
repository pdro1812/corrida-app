import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { cores, espacamento } from '../theme/theme';

interface Props {
  scroll?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = false, style }: PropsWithChildren<Props>) {
  if (scroll) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.conteudo, style]}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.container, styles.conteudo, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espacamento.md },
});
