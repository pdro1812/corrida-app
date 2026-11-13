// Só para `expo start --web` (testar telas no navegador): o expo-sqlite na
// web carrega o SQLite como .wasm. O APK não usa isto.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
