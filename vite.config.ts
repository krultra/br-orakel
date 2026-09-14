import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __ORAKEL_VERSION__: JSON.stringify(`0.${process.env.ORAKEL_DEMO_RELEASE?.trim() || '0'}.${process.env.ORAKEL_BUILD_NUMBER?.trim() || '1'}`),
    __ORAKEL_ENVIRONMENT__: JSON.stringify(process.env.ORAKEL_ENVIRONMENT?.trim() || 'lokal'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
});
