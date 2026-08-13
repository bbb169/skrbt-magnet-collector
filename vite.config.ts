import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  if (mode === 'content') {
    return {
      base: './',
      plugins: [react()],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        copyPublicDir: false,
        minify: 'oxc',
        lib: {
          entry: 'src/pronunciation/content.tsx',
          formats: ['iife'],
          name: 'SkrbtPronunciationContent',
          fileName: () => 'content.js',
        },
      },
    };
  }

  return {
    base: './',
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: 'popup.html',
          background: 'src/background.ts',
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === 'background'
              ? 'background.js'
              : 'assets/[name]-[hash].js',
        },
      },
    },
  };
});
