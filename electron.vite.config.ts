import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Vite resuelve los módulos a su ruta real; si el proyecto vive en una carpeta
// redirigida (unión NTFS, OneDrive, carpetas virtualizadas de Windows) la raíz
// del renderer debe usar también la ruta real o el build de index.html falla.
const rendererRoot = realpathSync.native(resolve(__dirname, 'src/renderer'))

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: rendererRoot,
    // Fotos y escudos procesados (public/media), compartidos con la versión web.
    publicDir: resolve(__dirname, 'public'),
    build: {
      rollupOptions: { input: { index: resolve(rendererRoot, 'index.html') } }
    },
    plugins: [react()]
  }
})
