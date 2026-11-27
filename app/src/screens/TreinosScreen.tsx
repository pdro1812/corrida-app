import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Segmentos } from '../components/Segmentos';
import { DiarioTreinosScreen } from './DiarioTreinosScreen';
import { AtividadesGarminScreen } from './AtividadesGarminScreen';
import { cores } from '../theme/theme';

type Secao = 'diario' | 'garmin';

// Aba Treinos: o diário (realizados com feedback) e os dados brutos do Garmin.
export function TreinosScreen() {
  const [secao, setSecao] = useState<Secao>('diario');
  return (
    <View style={styles.flex}>
      <Segmentos
        opcoes={[
          { valor: 'diario', rotulo: 'Diário' },
          { valor: 'garmin', rotulo: 'Garmin' },
        ]}
        valor={secao}
        onChange={setSecao}
      />
      {secao === 'diario' ? <DiarioTreinosScreen /> : <AtividadesGarminScreen />}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: cores.fundo } });
