/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Caminho relativo: funciona no GitHub Pages (subpasta) e no app desktop futuro.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
