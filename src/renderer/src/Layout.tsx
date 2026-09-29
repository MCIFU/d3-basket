import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SearchResult } from '../../shared/api'
import { PlayerPhoto, TeamLogo } from './components'
import { fmtDateTime } from './format'
import { href, navigate, type Route } from './router'

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#ff6b00" />
      <path d="M2 32h60M32 2v60" stroke="#0b1a33" strokeWidth="3" fill="none" />
      <path d="M11 11c9 7 13 14 13 21s-4 14-13 21M53 11c-9 7-13 14-13 21s4 14 13 21" stroke="#0b1a33" strokeWidth="3" fill="none" />
    </svg>
  )
}

const NAV: { page: Route['page']; label: string; to: string; also?: Route['page'][] }[] = [
  { page: 'home', label: 'Inicio', to: href.home() },
  { page: 'leagues', label: 'Ligas', to: href.leagues(), also: ['league', 'game'] },
  { page: 'clubs', label: 'Equipos', to: href.clubs(), also: ['club'] },
  { page: 'players', label: 'Jugadores', to: href.players(), also: ['player'] },
  { page: 'scouting', label: 'Scouting', to: href.scouting(), also: ['report'] },
  { page: 'data', label: 'Datos', to: href.data() }
]

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const [updated, setUpdated] = useState<string | null>(null)
  useEffect(() => {
    void window.d3.dbInfo().then((i) => setUpdated(i.updated_at))
  }, [])
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={href.home()}>
            <BrandMark />
            <span>
              D3 BASKET
              <small>Scouting · Baloncesto español</small>
            </span>
          </a>
          <nav className="main-nav">
            {NAV.map((n) => (
              <a key={n.page} href={n.to} className={n.page === route.page || n.also?.includes(route.page) ? 'active' : ''}>
                {n.label}
              </a>
            ))}
          </nav>
          <Search />
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <p>
              <b>D3 Basket</b> · Datos de <a href="https://acb.com" target="_blank" rel="noreferrer">acb.com</a> (estadísticas,
              plantillas, clasificación histórica), de{' '}
              <a href="https://baloncestoenvivo.feb.es" target="_blank" rel="noreferrer">baloncestoenvivo.feb.es</a> (Primera, Segunda y
              Tercera FEB) y de{' '}
              <a href="https://es.wikipedia.org" target="_blank" rel="noreferrer">Wikipedia</a> (palmarés por temporadas e historia
              de los clubes, CC BY-SA 4.0).
            </p>
            <p>
              Fotos de trofeos: Brgesto,{' '}
              <a href="https://commons.wikimedia.org/wiki/File:ACB_Trophy.png" target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
              , CC BY-SA 4.0. Uso personal de análisis; los datos pertenecen a sus titulares.
            </p>
          </div>
          <div>{updated ? `Datos actualizados: ${fmtDateTime(updated)}` : ''}</div>
        </div>
      </footer>
    </>
  )
}

function Search() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) setResults([])
      else void window.d3.search(q).then((r) => (setResults(r), setFocus(0)))
    }, 150)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const link = (r: SearchResult) => (r.kind === 'club' ? href.club(r.ref, r.name) : href.player(r.ref, r.name))
  const reset = () => (setQ(''), setResults([]), setOpen(false))
  const clubs = results.filter((r) => r.kind === 'club')
  const players = results.filter((r) => r.kind === 'player')
  const ordered = [...clubs, ...players]

  return (
    <div className="header-search" ref={box}>
      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        placeholder="Buscar jugador o equipo…"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setFocus((f) => Math.min(f + 1, ordered.length - 1)))
          if (e.key === 'ArrowUp') (e.preventDefault(), setFocus((f) => Math.max(f - 1, 0)))
          if (e.key === 'Enter' && ordered[focus]) (navigate(link(ordered[focus])), reset())
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && ordered.length > 0 && (
        <div className="search-results">
          {clubs.length > 0 && <div className="sr-kind">Equipos</div>}
          {clubs.map((r) => (
            <a key={`c${r.ref}`} href={link(r)} onClick={reset} className={ordered[focus] === r ? 'focus' : ''}>
              <TeamLogo src={r.image} name={r.name} size={30} />
              <span>
                <div className="sr-name">{r.name}</div>
                {r.detail && <div className="sr-detail">{r.detail}</div>}
              </span>
            </a>
          ))}
          {players.length > 0 && <div className="sr-kind">Jugadores</div>}
          {players.map((r) => (
            <a key={`p${r.ref}`} href={link(r)} onClick={reset} className={ordered[focus] === r ? 'focus' : ''}>
              <PlayerPhoto nobg={r.image} name={r.name} size={34} />
              <span>
                <div className="sr-name">{r.name}</div>
                {r.detail && <div className="sr-detail">{r.detail}</div>}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
