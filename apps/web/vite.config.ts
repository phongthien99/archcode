import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './': bản build chạy ở mọi đường dẫn tĩnh (GitHub Pages, S3, thư mục con...) mà không cần server.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
