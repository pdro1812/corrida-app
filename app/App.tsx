import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList, RootTabParamList } from './src/types/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { SemanaScreen } from './src/screens/SemanaScreen';
import { TreinoDetalheScreen } from './src/screens/TreinoDetalheScreen';
import { TreinoTiroScreen } from './src/screens/TreinoTiroScreen';
import { CriarEditarCicloScreen } from './src/screens/CriarEditarCicloScreen';
import { ImportarPlanilhaScreen } from './src/screens/ImportarPlanilhaScreen';
import { ProvasScreen } from './src/screens/ProvasScreen';
import { HistoricoCiclosScreen } from './src/screens/HistoricoCiclosScreen';
import { RegistrarTreinoManualScreen } from './src/screens/RegistrarTreinoManualScreen';
import { AtividadesGarminScreen } from './src/screens/AtividadesGarminScreen';
import { DiarioTreinosScreen } from './src/screens/DiarioTreinosScreen';
import { ConfiguracoesScreen } from './src/screens/ConfiguracoesScreen';
import { sincronizarSeNecessario } from './src/services/sync';
import { cores } from './src/theme/theme';

const Stack = createNativeStackNavigator<HomeStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: cores.superficie },
  headerTitleStyle: { color: cores.texto },
  headerTintColor: cores.primaria,
  contentStyle: { backgroundColor: cores.fundo },
};

function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Corrida App',
          headerRight: () => (
            <Pressable
              onPress={() => navigation.navigate('Configuracoes')}
              accessibilityRole="button"
              accessibilityLabel="Configurações"
              hitSlop={12}
            >
              <Ionicons name="settings-outline" size={22} color={cores.primaria} />
            </Pressable>
          ),
        })}
      />
      <Stack.Screen
        name="Configuracoes"
        component={ConfiguracoesScreen}
        options={{ title: 'Configurações' }}
      />
      <Stack.Screen name="Semana" component={SemanaScreen} />
      <Stack.Screen
        name="TreinoDetalhe"
        component={TreinoDetalheScreen}
        options={{ title: 'Treino' }}
      />
      <Stack.Screen
        name="TreinoTiro"
        component={TreinoTiroScreen}
        options={{ title: 'Treino de Tiro' }}
      />
      <Stack.Screen
        name="CriarEditarCiclo"
        component={CriarEditarCicloScreen}
        options={({ route }) => ({
          title: route.params?.cicloId ? 'Editar ciclo' : 'Novo ciclo',
        })}
      />
      <Stack.Screen
        name="HistoricoCiclos"
        component={HistoricoCiclosScreen}
        options={{ title: 'Histórico de ciclos' }}
      />
      <Stack.Screen
        name="RegistrarTreinoManual"
        component={RegistrarTreinoManualScreen}
        options={{ title: 'Registrar treino' }}
      />
    </Stack.Navigator>
  );
}

// Ícones de linha (outline) monocromáticos — mais minimalista que emoji
// colorido; preenchido quando a aba está ativa, contorno quando não.
const ICONES_POR_ABA: Record<keyof RootTabParamList, { ativo: keyof typeof Ionicons.glyphMap; inativo: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { ativo: 'home', inativo: 'home-outline' },
  Treinos: { ativo: 'journal', inativo: 'journal-outline' },
  Provas: { ativo: 'flag', inativo: 'flag-outline' },
  Importar: { ativo: 'cloud-upload', inativo: 'cloud-upload-outline' },
  Garmin: { ativo: 'watch', inativo: 'watch-outline' },
};

export default function App() {
  // Substitui o antigo cron diário do backend: ao abrir o app, sincroniza
  // com a Garmin se a última sincronização tiver mais de 12h. Silencioso —
  // o resultado aparece nas telas quando elas recarregam.
  useEffect(() => {
    void sincronizarSeNecessario().catch(() => undefined);
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          ...headerOptions,
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
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNavigator}
          options={{ title: 'Início', headerShown: false }}
        />
        <Tab.Screen name="Treinos" component={DiarioTreinosScreen} options={{ title: 'Diário de treinos' }} />
        <Tab.Screen name="Provas" component={ProvasScreen} options={{ title: 'Provas' }} />
        <Tab.Screen name="Importar" component={ImportarPlanilhaScreen} options={{ title: 'Importar planilha' }} />
        <Tab.Screen name="Garmin" component={AtividadesGarminScreen} options={{ title: 'Dados do Garmin' }} />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
