import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Segmentos } from '../components/Segmentos';
import { Screen } from '../components/Screen';
import { Banner, TipoBanner } from '../components/Banner';
import { PerfilAnaliseCard } from '../components/PerfilAnaliseCard';
import { LabScreen } from './LabScreen';
import { cores } from '../theme/theme';

type Secao = 'lab' | 'claude';
type Aviso = { tipo: TipoBanner; titulo: string; mensagem?: string };

// Aba Análise: o Lab (custo, recuperação) e o que alimenta a análise pelo
// Claude (recordes, observações e o banco .db).
export function AnaliseScreen() {
  const [secao, setSecao] = useState<Secao>('lab');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  return (
    <View style={styles.flex}>
      <Segmentos
        opcoes={[
          { valor: 'lab', rotulo: 'Lab' },
          { valor: 'claude', rotulo: 'Recordes e export' },
        ]}
        valor={secao}
        onChange={setSecao}
      />
      {secao === 'lab' ? (
        <LabScreen />
      ) : (
        <Screen scroll>
          {aviso ? <Banner tipo={aviso.tipo} titulo={aviso.titulo} mensagem={aviso.mensagem} onFechar={() => setAviso(null)} /> : null}
          <PerfilAnaliseCard onAviso={setAviso} />
        </Screen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: cores.fundo } });
