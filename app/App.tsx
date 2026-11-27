import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createNavigationContainerRef, DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AbasParamList, RootStackParamList } from './src/types/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { SemanaScreen } from './src/screens/SemanaScreen';
import { TreinoDetalheScreen } from './src/screens/TreinoDetalheScreen';
import { TreinoTiroScreen } from './src/screens/TreinoTiroScreen';
import { CriarEditarCicloScreen } from './src/screens/CriarEditarCicloScreen';
import { ImportarPlanilhaScreen } from './src/screens/ImportarPlanilhaScreen';
import { HistoricoCiclosScreen } from './src/screens/HistoricoCiclosScreen';
import { RegistrarTreinoManualScreen } from './src/screens/RegistrarTreinoManualScreen';
import { ConfiguracoesScreen } from './src/screens/ConfiguracoesScreen';
import { AvaliarTreinoScreen } from './src/screens/AvaliarTreinoScreen';
import { CicloScreen } from './src/screens/CicloScreen';
import { TreinosScreen } from './src/screens/TreinosScreen';
import { AnaliseScreen } from './src/screens/AnaliseScreen';
import { sincronizarSeNecessario } from './src/services/sync';
import { listarTreinosSemRpe } from './src/services/rpe';
import { aoTocarNotificacaoRpe, notificarRpePendente } from './src/services/notificacoes';
import { cores } from './src/theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<AbasParamList>();
const navegacao = createNavigationContainerRef<RootStackParamList>();

// v2: tema escuro também na navegação (sem flash branco entre telas).
const temaNavegacao: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: cores.primaria,
    background: cores.fundo,
    card: cores.superficie,
    text: cores.texto,
    border: cores.borda,
  },
};

function abrirAvaliacao(treinoRealizadoId: string) {
  if (navegacao.isReady()) {
    navegacao.navigate('AvaliarTreino', { treinoRealizadoId });
  }
}

const headerOptions = {
  headerStyle: { backgroundColor: cores.superficie },
  headerTitleStyle: { color: cores.texto },
  headerTintColor: cores.primaria,
  contentStyle: { backgroundColor: cores.fundo },
};

// Engrenagem no topo de todas as abas.
function BotaoConfiguracoes() {
  return (
    <Pressable
      onPress={() => navegacao.isReady() && navegacao.navigate('Configuracoes')}
      accessibilityRole="button"
      accessibilityLabel="Configurações"
      hitSlop={12}
      style={{ marginRight: 16 }}
    >
      <Ionicons name="settings-outline" size={22} color={cores.primaria} />
    </Pressable>
  );
}

// Ícones de linha (outline) monocromáticos; preenchido quando a aba está
// ativa, contorno quando não.
const ICONES_POR_ABA: Record<keyof AbasParamList, { ativo: keyof typeof Ionicons.glyphMap; inativo: keyof typeof Ionicons.glyphMap }> = {
  Hoje: { ativo: 'today', inativo: 'today-outline' },
  Ciclo: { ativo: 'calendar', inativo: 'calendar-outline' },
  Treinos: { ativo: 'journal', inativo: 'journal-outline' },
  Analise: { ativo: 'pulse', inativo: 'pulse-outline' },
};

function Abas() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...headerOptions,
        headerRight: () => <BotaoConfiguracoes />,
        tabBarActiveTintColor: cores.primaria,
        tabBarInactiveTintColor: cores.textoSecundario,
        tabBarStyle: { backgroundColor: cores.superficie, borderTopColor: cores.borda },
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons
            name={focused ? ICONES_POR_ABA[route.name].ativo : ICONES_POR_ABA[route.name].inativo}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen name="Hoje" component={HomeScreen} options={{ title: 'Hoje' }} />
      <Tab.Screen name="Ciclo" component={CicloScreen} options={{ title: 'Ciclo' }} />
      <Tab.Screen name="Treinos" component={TreinosScreen} options={{ title: 'Treinos' }} />
      <Tab.Screen name="Analise" component={AnaliseScreen} options={{ title: 'Análise' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  // Substitui o antigo cron diário do backend: ao abrir o app, sincroniza
  // com a Garmin se a última sincronização tiver mais de 12h. Silencioso —
  // o resultado aparece nas telas quando elas recarregam.
  useEffect(() => {
    void sincronizarSeNecessario()
      .then(async (resultado) => {
        // Uma notificação por treino sem RPE que ainda não foi avisado.
        if (resultado?.ok) {
          await notificarRpePendente(await listarTreinosSemRpe());
        }
      })
      .catch(() => undefined);
    return aoTocarNotificacaoRpe(abrirAvaliacao);
  }, []);

  return (
    <NavigationContainer ref={navegacao} theme={temaNavegacao}>
      <Stack.Navigator screenOptions={headerOptions}>
        <Stack.Screen name="Abas" component={Abas} options={{ headerShown: false }} />
        <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
        <Stack.Screen name="Semana" component={SemanaScreen} />
        <Stack.Screen name="TreinoDetalhe" component={TreinoDetalheScreen} options={{ title: 'Treino' }} />
        <Stack.Screen name="TreinoTiro" component={TreinoTiroScreen} options={{ title: 'Treino de Tiro' }} />
        <Stack.Screen
          name="CriarEditarCiclo"
          component={CriarEditarCicloScreen}
          options={({ route }) => ({ title: route.params?.cicloId ? 'Editar ciclo' : 'Novo ciclo' })}
        />
        <Stack.Screen name="HistoricoCiclos" component={HistoricoCiclosScreen} options={{ title: 'Histórico de ciclos' }} />
        <Stack.Screen name="AvaliarTreino" component={AvaliarTreinoScreen} options={{ title: 'Avaliar treino' }} />
        <Stack.Screen name="RegistrarTreinoManual" component={RegistrarTreinoManualScreen} options={{ title: 'Registrar treino' }} />
        <Stack.Screen name="ImportarPlanilha" component={ImportarPlanilhaScreen} options={{ title: 'Importar planilha' }} />
      </Stack.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
