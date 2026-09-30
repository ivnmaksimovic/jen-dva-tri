import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built app works inside the Capacitor
  // WebView on Android/iOS, not just on a dev server.
  base: './',
  server: {
    // Listen on all interfaces so you can test on a phone via LAN.
    host: true,
  },
  build: {
    target: 'es2022',
  },
});
