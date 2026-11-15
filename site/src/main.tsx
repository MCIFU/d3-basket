import { StrictMode, lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { Header } from './components/Header'
import { Loading, NotFound } from './components/ui'
import { loadMeta, useLoad } from './lib/data'
import { useRoute } from './lib/router'

const Home = lazy(() => import('./pages/Home'))
const Leagues = lazy(() => import('./pages/Leagues'))
const League = lazy(() => import('./pages/League'))
const Club = lazy(() => import('./pages/Club'))
const Player = lazy(() => import('./pages/Player'))
const Game = lazy(() => import('./pages/Game'))

function App() {
  const meta = useLoad(loadMeta, [])
  const { path } = useRoute()
  const [page, a, b] = path
  const section = !page ? 'hoy' : page === 'ligas' || page === 'liga' ? 'ligas' : page
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
  else body = <NotFound what="Página" />
  return (
    <>
      <Header meta={m} section={section} />
      <Suspense fallback={<Loading />}>{body}</Suspense>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
