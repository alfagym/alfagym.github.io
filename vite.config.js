import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const now = new Date();
const timeStr = now.toLocaleTimeString('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});
const dateStr = now.toLocaleDateString('en-US', {
  timeZone: 'America/New_York',
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
});
const buildTimestamp = `${timeStr} - ${dateStr}`;

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
