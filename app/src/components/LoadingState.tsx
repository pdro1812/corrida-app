import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { cores } from '../theme/theme';

export function LoadingState() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={cores.primaria} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },
});
