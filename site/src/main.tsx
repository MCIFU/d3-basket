import { StrictMode, lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { Header } from './components/Header'
import { Loading, NotFound } from './components/ui'
import { loadClub, loadEd, loadGame, loadMeta, loadPlayer, useLoad } from './lib/data'
import { useRoute } from './lib/router'

const Home = lazy(() => import('./pages/Home'))
const Leagues = lazy(() => import('./pages/Leagues'))
const League = lazy(() => import('./pages/League'))
const Club = lazy(() => import('./pages/Club'))
const Player = lazy(() => import('./pages/Player'))
const Game = lazy(() => import('./pages/Game'))
const Players = lazy(() => import('./pages/Players'))
const Spaniards = lazy(() => import('./pages/Spaniards'))
const Compare = lazy(() => import('./pages/Compare'))

function App() {
  const meta = useLoad(loadMeta, [])
  const { path } = useRoute()
  const [page, a, b] = path
  const section = !page ? 'hoy' : page === 'ligas' || page === 'liga' ? 'ligas' : page === 'jugador' ? 'jugadores' : page
  useEffect(() => {
    if (!page) document.title = 'd3 basket'
  }, [page])
  const m = meta && !(meta instanceof Error) ? meta : undefined
  let body
  if (meta instanceof Error) body = <div className="loading">No se han podido cargar los datos</div>
  else if (!m) body = <Loading />
  else if (!page) body = <Home meta={m} />
  else if (page === 'ligas') body = <Leagues meta={m} />
  else if (page === 'liga' && a) body = <League meta={m} code={a} year={b ? Number(b) : undefined} />
  else if (page === 'club' && a) body = <Club meta={m} refId={a} year={b ? Number(b) : undefined} />
  else if (page === 'jugador' && a) body = <Player meta={m} refId={a} />
  else if (page === 'partido' && a) body = <Game meta={m} refId={a} />
  else if (page === 'jugadores') body = <Players meta={m} />
  else if (page === 'espanoles') body = <Spaniards meta={m} />
  else if (page === 'comparar') body = <Compare meta={m} a={a} b={b} />
  else body = <NotFound what="Página" />
  return (
    <>
      <Header meta={m} section={section} />
      <div id="contenido" tabIndex={-1} style={{ outline: 'none' }}>
        <Suspense fallback={<Loading />}>{body}</Suspense>
      </div>
    </>
  )
}

// Precarga: al pasar el ratón (o el foco) por un enlace se piden ya sus datos; el clic abre al instante.
const prefetched = new Set<string>()
const prefetch = (e: Event) => {
  const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null
  const h = a?.getAttribute('href')
  if (!h || prefetched.has(h)) return
  prefetched.add(h)
  const [kind, ref, y] = h.slice(2).split(/[/?]/).map(decodeURIComponent)
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined)
  if (kind === 'jugador' && ref) quiet(loadPlayer(ref))
  else if (kind === 'club' && ref) quiet(loadClub(ref))
  else if (kind === 'partido' && ref) quiet(loadGame(ref).then((g) => g && loadEd(g.ed)))
  else if (kind === 'liga' && ref)
    quiet(
      loadMeta().then((m) => {
        const c = m.comps.find((x) => x.code === ref)
        const e2 = c && (y ? c.eds.find((x) => x.y === Number(y)) : c.eds[0])
        return e2 && loadEd(e2.id)
      })
    )
}
document.addEventListener('pointerover', prefetch, { passive: true })
document.addEventListener('focusin', prefetch)

// Funcionamiento sin conexión e instalación como aplicación (solo en la web construida).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
