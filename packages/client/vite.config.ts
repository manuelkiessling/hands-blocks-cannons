import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'ES2022',
    sourcemap: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // Path from workspace root (npm hoists dependencies)
          src: resolve(__dirname, '../../node_modules/@mediapipe/hands/*'),
          dest: 'mediapipe/hands',
        },
      ],
    }),
  ],
});
