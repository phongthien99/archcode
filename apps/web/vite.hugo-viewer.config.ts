import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // WASM của libavoid (LGPL) không được nhúng vào file viewer — xem src/libavoid-stub.ts.
    alias: { 'libavoid-js': resolve(import.meta.dirname, 'src/libavoid-stub.ts') },
  },
  build: {
    target: 'es2022',
    outDir: 'dist-hugo',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/hugo-viewer.ts'),
      name: 'ArchCodeHugoViewer',
      formats: ['iife'],
      fileName: () => 'archcode-viewer.js',
    },
    chunkSizeWarningLimit: 3000,
  },
});
