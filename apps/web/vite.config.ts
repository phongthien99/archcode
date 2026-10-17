import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `exports` của libavoid-js không mở subpath cho file WASM → alias thẳng tới file (resolve từ core,
// nơi khai báo dependency).
const coreRequire = createRequire(resolve(import.meta.dirname, '../../packages/core/package.json'));
const libavoidWasm = resolve(dirname(coreRequire.resolve('libavoid-js')), 'libavoid.wasm');

// base './': bản build chạy ở mọi đường dẫn tĩnh (GitHub Pages, S3, thư mục con...) mà không cần server.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: [{ find: /^libavoid-js\/libavoid\.wasm/, replacement: libavoidWasm }] },
  worker: { format: 'es' },
  // libavoid-js tìm libavoid.wasm qua `new URL(..., import.meta.url)`; pre-bundle của dev server làm
  // sai đường dẫn đó.
  optimizeDeps: { exclude: ['libavoid-js'] },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
