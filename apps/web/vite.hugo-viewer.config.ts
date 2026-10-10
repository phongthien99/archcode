import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
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
