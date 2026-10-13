import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin proxy so the session cookie stays first-party in development.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/uploads': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: { port: 4173 },
  build: { target: 'es2020', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
