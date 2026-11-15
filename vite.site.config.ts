/**
 * Web nueva de d3 basket (site/). Lee los JSON que genera tools/site/export.ts en public/d
 * y comparte public/media (escudos, logos de ligas y fotos procesadas) con la web anterior.
 */
import { realpathSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = realpathSync.native(__dirname)

export default defineConfig({
  root: resolve(root, 'site'),
  base: './',
  publicDir: resolve(root, 'public'),
  plugins: [
    react(),
    {
      // La base de datos completa (public/data, 34 MB) es de la web anterior y del CI: no se publica.
      name: 'sin-base-de-datos',
      apply: 'build',
      closeBundle() {
        rmSync(resolve(root, 'dist-site/data'), { recursive: true, force: true })
      }
    }
  ],
  build: { outDir: resolve(root, 'dist-site'), emptyOutDir: true, target: 'es2022' },
  server: { port: 5175 },
  preview: { port: 4173 }
})
