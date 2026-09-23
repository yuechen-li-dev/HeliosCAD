import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aetherisCad } from '@aetheris/cad/vite';

export default defineConfig({
  plugins: [aetherisCad(), react()],
  server: { port: 4173, proxy: { '/api': 'http://127.0.0.1:5189' } },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true }
});
