import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: process.env.RENDER ? '.' : '..',
  server: {
    port: 5173,
    host: true,
    allowedHosts: [
      'unimpearled-unintricate-son.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok.app',
      '.ngrok.io',
    ],
    proxy: {
      '/api': 'http://localhost:5050',
    },
  },
});
