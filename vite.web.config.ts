/**
 * Build de la versión web (navegador / Netlify). Reutiliza el renderer de la app
 * de escritorio; sin preload de Electron, `main.tsx` carga la API web (sql.js).
 */
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = realpathSync.native(__dirname)

export default defineConfig({
  root: resolve(projectRoot, 'src/renderer'),
  base: './',
  // Datos publicados por `npm run scrape -- export-web` (data/web/data/d3basket.db.gz).
  publicDir: resolve(projectRoot, 'data/web'),
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, 'dist-web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500
  },
  server: { port: 5174 }
})
