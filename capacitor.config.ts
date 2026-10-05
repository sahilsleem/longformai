import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.longformai.app',
  appName: 'Niggachu',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      backgroundColor: '#000000',
      launchShowDuration: 2000,
      launchAutoHide: true,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
