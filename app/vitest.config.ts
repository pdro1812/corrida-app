import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes da lógica de domínio e dos serviços contra um SQLite em memória
// (node:sqlite). Módulos nativos do Expo são trocados por stubs.
const stub = (nome: string) => fileURLToPath(new URL(`./test/stubs/${nome}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'expo-crypto': stub('expo-crypto'),
      'expo-secure-store': stub('expo-secure-store'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
