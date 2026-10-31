import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../../assets'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Dev proxy to apps/server, so LiveWSDriver's same-host /ws/session URL reaches the backend.
    proxy: {
      '/ws': { target: process.env.CUEX_SERVER_ORIGIN ?? 'http://127.0.0.1:8765', ws: true },
      '/health': { target: process.env.CUEX_SERVER_ORIGIN ?? 'http://127.0.0.1:8765' },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
