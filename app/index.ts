import { registerRootComponent } from 'expo';

// Define a tarefa de sync em segundo plano antes do App (exigência do
// expo-task-manager: a tarefa precisa existir quando o sistema acorda o JS).
import './src/services/tarefaSync';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
