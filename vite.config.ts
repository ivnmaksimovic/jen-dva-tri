import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // Relative asset paths so the built app works inside the Capacitor
  // WebView on Android/iOS, not just on a dev server.
  base: './',
  // HTTPS so the phone's motion sensors (DeviceMotionEvent — push-the-phone
  // control scheme) work on the LAN dev server; sensors need a secure context.
  plugins: [basicSsl()],
  server: {
    // Listen on all interfaces so you can test on a phone via LAN.
    host: true,
  },
  build: {
    target: 'es2022',
  },
});
