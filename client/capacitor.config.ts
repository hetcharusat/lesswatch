import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tech.atmyhome.letswatch',
  appName: 'Watch Together',
  webDir: '../public',
  server: {
    url: 'https://letswatch.atmyhome.tech',
    cleartext: true,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;
