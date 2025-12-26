import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGestureAppViteConfig } from '@gesture-app/framework-build';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default createGestureAppViteConfig({
  clientDir: __dirname,
  port: 5173,
  open: true,
  sourcemap: true,
});
