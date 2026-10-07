import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    proxy: {
      '/api/suggest': {
        target: 'https://suggestqueries.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/suggest', '/complete/search?client=chrome'),
      },
    },
  },
});
