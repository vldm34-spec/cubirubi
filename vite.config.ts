import { defineConfig } from 'vite';

// base: './' — относительные пути, чтобы dist/ работал на GitHub Pages,
// на любом статическом хостинге и даже при открытии из папки.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
});
