import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on the local network so a phone can connect
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
