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
  // public/media: fotos y escudos procesados (tools/media); public/data: datos
  // publicados por `npm run scrape -- export-web` (no se versionan).
  publicDir: resolve(projectRoot, 'public'),
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, 'dist-web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500
  },
  server: { port: 5174 }
})
