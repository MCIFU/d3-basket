import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/figtree'
import '@fontsource/permanent-marker'
import { App } from './App'
import './styles.css'
import { initTheme } from './theme'

// Antes de pintar nada, para no mostrar un destello del tema equivocado.
initTheme()

const root = document.getElementById('root')!

async function boot() {
  // En Electron el preload ya ha expuesto window.d3. En el navegador se carga
  // la versión web (SQLite en WebAssembly + datos publicados).
  if (!window.d3) {
    const { createWebApi } = await import('./web/webApi')
    window.d3 = await createWebApi()
    if (import.meta.env.VITE_ARTIFACT) {
      const { withMediaPack } = await import('./web/mediaPack')
      window.d3 = await withMediaPack(window.d3)
    }
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

boot().catch((err: unknown) => {
  console.error(err)
  root.innerHTML = `<div class="boot">No se pudieron cargar los datos. Recarga la página.<br><small>${String(
    err instanceof Error ? err.message : err
  ).replace(/</g, '&lt;')}</small></div>`
})
