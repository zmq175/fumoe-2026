import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'preserve-app-script-execution',
    // Vite recreates the module tag, discarding source HTML's data-cfasync.
    transformIndexHtml: {
      order: 'post',
      handler: html => html.replace(/<script\b(?![^>]*data-cfasync)/g, '<script data-cfasync="false"'),
    },
  }],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'], force: true },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] }
})
