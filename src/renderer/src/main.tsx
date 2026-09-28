import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')!

async function boot() {
  // En Electron el preload ya ha expuesto window.d3. En el navegador se carga
  // la versión web (SQLite en WebAssembly + datos publicados).
  if (!window.d3) {
    const { createWebApi } = await import('./web/webApi')
    window.d3 = await createWebApi()
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
