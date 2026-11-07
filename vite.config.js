import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const now = new Date();
const buildId = Date.now().toString();
const timeStr = now.toLocaleTimeString('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
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

function alfaGymAutoUpdatePlugin() {
  return {
    name: 'alfa-gym-auto-update',
    transformIndexHtml(html) {
      return html
        .replace(
          /src="(\.?\/assets\/index\.js)"/g,
          `src="$1?v=${buildId}"`
        )
        .replace(
          /href="(\.?\/assets\/index\.css)"/g,
          `href="$1?v=${buildId}"`
        );
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          {
            buildId,
            buildTimestamp,
          },
          null,
          2
        ),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), alfaGymAutoUpdatePlugin()],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __BUILD_ID__: JSON.stringify(buildId),
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
