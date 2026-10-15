import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SearchResult } from '../../shared/api'
import { PlayerPhoto, TeamLogo } from './components'
import { fmtDateTime } from './format'
import { href, navigate, type Route } from './router'
import { getThemePref, setThemePref, type ThemePref } from './theme'
import { LEAGUES } from './leagues'

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#e1342a" />
      <path d="M2 32h60M32 2v60" stroke="#fff" strokeWidth="3.4" fill="none" />
      <path d="M11 11c9 7 13 14 13 21s-4 14-13 21M53 11c-9 7-13 14-13 21s4 14 13 21" stroke="#fff" strokeWidth="3.4" fill="none" />
    </svg>
  )
}

const NAV: { page: Route['page']; label: string; to: string; also?: Route['page'][] }[] = [
  { page: 'home', label: 'Inicio', to: href.home() },
  { page: 'leagues', label: 'Ligas', to: href.leagues(), also: ['league', 'game'] },
  { page: 'clubs', label: 'Equipos', to: href.clubs(), also: ['club'] },
  { page: 'players', label: 'Jugadores', to: href.players(), also: ['player', 'compare'] },
  { page: 'scouting', label: 'Scouting', to: href.scouting(), also: ['report'] },
  { page: 'data', label: 'Datos', to: href.data() }
]

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL: Record<ThemePref, string> = { system: 'Tema: automático (sistema)', light: 'Tema: claro', dark: 'Tema: oscuro' }

/** Botón de tema: automático → claro → oscuro. */
function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(getThemePref)
  const change = () => {
    const next = THEME_NEXT[pref]
    setThemePref(next)
    setPref(next)
  }
  return (
    <button className="theme-toggle" onClick={change} title={THEME_LABEL[pref]} aria-label={THEME_LABEL[pref]}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {pref === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : pref === 'dark' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
          </>
        )}
      </svg>
    </button>
  )
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const [updated, setUpdated] = useState<string | null>(null)
  useEffect(() => {
    void window.d3.dbInfo().then((i) => setUpdated(i.updated_at))
  }, [])
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href={href.home()}>
          <BrandMark />
          <span>
            D3 Basket
            <small>Pizarra del baloncesto español</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Secciones">
          {NAV.map((n) => (
            <a key={n.page} href={n.to} className={n.page === route.page || n.also?.includes(route.page) ? 'active' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
        {[
          ['España', Object.entries(LEAGUES).filter(([, l]) => !/^(Europa|Campeonato)/.test(l.division))],
          ['Campeonatos de España', Object.entries(LEAGUES).filter(([, l]) => l.division.startsWith('Campeonato'))],
          ['Europa', Object.entries(LEAGUES).filter(([, l]) => l.division.startsWith('Europa'))]
        ].map(([title, list]) => (
          <div key={title as string} className="side-leagues">
            <h4>{title as string}</h4>
            {(list as [string, (typeof LEAGUES)[string]][]).map(([code, l]) => (
              <a key={code} href={href.league(code)} className={route.page === 'league' && 'code' in route && String(route.code).toUpperCase() === code ? 'active' : ''}>
                <i style={{ background: l.color }} />
                {l.name}
              </a>
            ))}
          </div>
        ))}
        <div className="side-foot">
          <ThemeToggle />
          <span>{updated ? `Actualizado ${fmtDateTime(updated)}` : ''}</span>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <Search />
        </header>
        <main className="page">{children}</main>
        <footer className="site-footer">
          <div className="footer-inner">
            <p>
              <b>D3 Basket</b> · Datos de <a href="https://acb.com" target="_blank" rel="noreferrer">acb.com</a> (estadísticas, plantillas,
              clasificación histórica), de <a href="https://baloncestoenvivo.feb.es" target="_blank" rel="noreferrer">baloncestoenvivo.feb.es</a>{' '}
              (Primera, Segunda y Tercera FEB) y de <a href="https://es.wikipedia.org" target="_blank" rel="noreferrer">Wikipedia</a> (palmarés e
              historia de los clubes, CC BY-SA 4.0). Fotos de trofeos: Brgesto,{' '}
              <a href="https://commons.wikimedia.org/wiki/File:ACB_Trophy.png" target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
              , CC BY-SA 4.0. Uso personal de análisis; los datos pertenecen a sus titulares.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Search() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // Atajo «/» para buscar desde cualquier página.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) (e.preventDefault(), input.current?.focus())
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

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
        ref={input}
        aria-label="Buscar jugador o equipo"
        placeholder="Buscar jugador o equipo…  ( / )"
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
