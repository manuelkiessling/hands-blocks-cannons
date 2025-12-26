import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname, // Set root to client directory (config is in client/)
  base: './',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'ES2022',
  },
  server: {
    port: 5174,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // Copy MediaPipe hands assets
          src: resolve(__dirname, '../../../../node_modules/@mediapipe/hands/*'),
          dest: 'mediapipe/hands',
        },
      ],
    }),
  ],
});
