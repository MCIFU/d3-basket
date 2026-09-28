import { useEffect, useState } from 'react'
import type { SearchResult } from '../../shared/api'
import { useLoad, type Route } from './ui'
import { Game } from './views/Game'
import { Games } from './views/Games'
import { Home } from './views/Home'
import { Player } from './views/Player'
import { ReportEditor, Scouting } from './views/Scouting'
import { Team, Teams } from './views/Teams'

const NAV: { name: Route['name']; label: string }[] = [
  { name: 'home', label: 'Inicio' },
  { name: 'games', label: 'Calendario' },
  { name: 'teams', label: 'Equipos' },
  { name: 'scouting', label: 'Scouting' }
]

export function App() {
  const [editions, reloadEditions] = useLoad(() => window.d3.editions(), [])
  const [info] = useLoad(() => window.d3.dbInfo(), [editions])
  const [csId, setCsId] = useState<number>()
  const [history, setHistory] = useState<Route[]>([{ name: 'home' }])
  const route = history[history.length - 1]

  useEffect(() => {
    if (editions?.length && !editions.some((e) => e.id === csId)) {
      setCsId((editions.find((e) => e.is_current) ?? editions[0]).id)
    }
  }, [editions, csId])

  const navigate = (r: Route) => {
    setHistory((h) => [...h.slice(-30), r])
    document.querySelector('.main')?.scrollTo(0, 0)
  }
  const goSection = (name: Route['name']) => setHistory([{ name } as Route])
  const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))
  const edition = editions?.find((e) => e.id === csId)

  let view: React.ReactNode
  if (route.name === 'home') view = <Home edition={edition} navigate={navigate} onSynced={reloadEditions} />
  else if (!csId && ['games', 'teams'].includes(route.name))
    view = <div className="empty">Sincroniza una temporada desde Inicio.</div>
  else if (route.name === 'games') view = <Games key={csId} csId={csId!} navigate={navigate} initialRound={route.round} />
  else if (route.name === 'teams') view = <Teams csId={csId!} navigate={navigate} />
  else if (route.name === 'team') view = <Team key={route.id} id={route.id} navigate={navigate} />
  else if (route.name === 'player') view = <Player key={route.id} id={route.id} navigate={navigate} />
  else if (route.name === 'game') view = <Game key={route.id} id={route.id} navigate={navigate} />
  else if (route.name === 'scouting') view = <Scouting navigate={navigate} />
  else if (route.name === 'report')
    view = <ReportEditor key={`${route.playerId}-${route.reportId}`} playerId={route.playerId} reportId={route.reportId} navigate={navigate} />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D3</div>
          D3 Basket
        </div>
        {editions && editions.length > 0 && (
          <select className="season-select" value={csId ?? ''} onChange={(e) => setCsId(Number(e.target.value))}>
            {editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.competition_code} {e.season_label}
              </option>
            ))}
          </select>
        )}
        {NAV.map((n) => (
          <button
            key={n.name}
            className={`nav-item ${history[0].name === n.name ? 'active' : ''}`}
            onClick={() => goSection(n.name)}
          >
            {n.label}
          </button>
        ))}
        <div className="sidebar-footer">
          {info && (
            <>
              {info.counts.players} jugadores · {info.counts.games} partidos
              <br />
              <span title={info.path}>BD local SQLite</span>
            </>
          )}
          <br />
          LEB Oro / LEB Plata: próximamente
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          {history.length > 1 && (
            <button className="back" onClick={back}>
              ← Volver
            </button>
          )}
          <PlayerSearch onPick={(id) => navigate({ name: 'player', id })} />
        </div>
        <div className="content">{view}</div>
      </main>
    </div>
  )
}

function PlayerSearch({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) setResults([])
      else void window.d3.search(q).then(setResults)
    }, 180)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="search">
      <input placeholder="Buscar jugador…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button
              key={r.player_id}
              onClick={() => {
                onPick(r.player_id)
                setQ('')
                setResults([])
              }}
            >
              <span>
                <strong>{r.display_name}</strong> <span style={{ color: 'var(--muted)' }}>{r.position}</span>
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {r.team_name} {r.season_label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
