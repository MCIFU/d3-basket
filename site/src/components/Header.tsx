import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSearch, type Meta, type SearchIdx } from '../lib/data'
import { href } from '../lib/router'
import { BallMark, Crest, src } from './ui'

const COUNTRY: Record<string, string> = { ES: 'España', EU: 'Europa', DE: 'Alemania', FR: 'Francia', GR: 'Grecia', IT: 'Italia', TR: 'Turquía', US: 'Estados Unidos' }
export const countryName = (c: string) => COUNTRY[c] ?? c

function toggleTheme() {
  const r = document.documentElement
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  r.dataset.theme = dark ? 'light' : 'dark'
  try {
    localStorage.setItem('d3-theme', r.dataset.theme)
  } catch {}
}

const Icon = {
  search: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3.5 3.5" />
    </svg>
  ),
  theme: (
    <svg viewBox="0 0 16 16">
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13z" fill="currentColor" />
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" fill="none" strokeWidth="1.3" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  )
}

const NAV: [string, string, string][] = [
  ['#/', 'Hoy', 'hoy'],
  ['#/ligas', 'Competiciones', 'ligas'],
  ['#/jugadores', 'Jugadores', 'jugadores'],
  ['#/espanoles', 'Españoles', 'espanoles'],
  ['#/comparar', 'Comparar', 'comparar']
]

export function Header({ meta, section }: { meta?: Meta; section: string }) {
  const [solid, setSolid] = useState(false)
  const [search, setSearch] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 30)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
      } else if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  useEffect(() => {
    const close = () => setMenu(false)
    window.addEventListener('hashchange', close)
    return () => window.removeEventListener('hashchange', close)
  }, [])
  return (
    <>
      <a className="skip" href="#contenido" onClick={(e) => (e.preventDefault(), document.getElementById('contenido')?.focus())}>
        Saltar al contenido
      </a>
      <header className={`top ${solid ? 'solid' : ''}`}>
        <div className="wrap">
          <button className="ib burger" aria-label="Menú" onClick={() => setMenu(true)}>
            {Icon.menu}
          </button>
          <a className="brand" href={href.home()} aria-label="d3 basket, inicio">
            <BallMark />
            <span>
              d3 <i>basket</i>
            </span>
          </a>
          <nav className="main">
            {NAV.map(([to, label, key]) => (
              <a key={key} href={to} className={section === key ? 'on' : ''} aria-current={section === key ? 'page' : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <div className="tools">
            <button className="ib" onClick={() => setSearch(true)} aria-label="Buscar">
              {Icon.search}
              <span className="lbl">Buscar</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button className="ib" onClick={toggleTheme} aria-label="Cambiar tema claro u oscuro">
              {Icon.theme}
            </button>
          </div>
        </div>
      </header>
      {search && <Search onClose={() => setSearch(false)} />}
      {menu && meta && (
        <div className="drawer" onClick={() => setMenu(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <a className="brand" href={href.home()} style={{ marginBottom: 10, color: 'var(--tx)' }}>
              <BallMark />
              <span>
                d3 <i>basket</i>
              </span>
            </a>
            {NAV.map(([to, label, key]) => (
              <a key={key} href={to}>
                {label}
              </a>
            ))}
            {[...new Set(meta.comps.map((c) => c.country))].map((cn) => (
              <div key={cn}>
                <h4>{countryName(cn)}</h4>
                {meta.comps
                  .filter((c) => c.country === cn && c.tier != null)
                  .map((c) => (
                    <a key={c.code} href={href.comp(c.code)}>
                      {c.logo ? <img src={src(c.logo)} alt="" /> : <span style={{ width: 24 }} />}
                      {c.name}
                    </a>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function Search({ onClose }: { onClose: () => void }) {
  const [idx, setIdx] = useState<SearchIdx>()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    loadSearch().then(setIdx)
    input.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])
  const prepared = useMemo(() => idx && { p: idx.p.map((r) => [norm(r[1]), r] as const), c: idx.c.map((r) => [norm(r[1]), r] as const) }, [idx])
  const res = useMemo(() => {
    if (!prepared || q.trim().length < 2) return []
    const words = norm(q).split(/\s+/).filter(Boolean)
    const match = (n: string) => words.every((w) => n.includes(w))
    const score = (n: string, y: number | null) => (n.startsWith(words[0]) || n.includes(' ' + words[0]) ? 0 : 1) * 10000 - (y ?? 0)
    const clubs = prepared.c
      .filter(([n]) => match(n))
      .sort((a, b) => score(a[0], a[1][4]) - score(b[0], b[1][4]))
      .slice(0, 5)
      .map(([, r]) => ({ to: href.club(r[0]), name: r[1], sub: r[3] ? `${r[3].replace(/_/g, ' ')} · ${r[4]}` : '', logo: r[2], kind: 'Club' }))
    const players = prepared.p
      .filter(([n]) => match(n))
      .sort((a, b) => score(a[0], a[1][4]) - score(b[0], b[1][4]))
      .slice(0, 12)
      .map(([, r]) => ({ to: href.player(r[0]), name: r[1], sub: [r[2], r[4] ? `${r[4]}-${String(r[4] + 1).slice(2)}` : null].filter(Boolean).join(' · '), logo: r[5], kind: 'Jugador' }))
    return [...clubs, ...players]
  }, [prepared, q])
  useEffect(() => setSel(0), [q])
  const open = (to: string) => {
    location.hash = to.replace(/^#/, '')
    onClose()
  }
  return (
    <div className="search-ov" onClick={onClose}>
      <div className="search-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Buscar">
        <div className="in">
          <span style={{ width: 18, color: 'var(--tx3)' }}>{Icon.search}</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar jugador o club"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, res.length - 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)))
              else if (e.key === 'Enter' && res[sel]) open(res[sel].to)
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="res">
          {!idx && <div className="hint">Cargando el índice…</div>}
          {idx && q.trim().length < 2 && (
            <div className="hint">
              {idx.p.length.toLocaleString('es-ES')} jugadores y {idx.c.length.toLocaleString('es-ES')} clubes. Escribe al menos dos letras.
            </div>
          )}
          {idx && q.trim().length >= 2 && !res.length && <div className="hint">Sin resultados para «{q}»</div>}
          {res.map((r, i) => (
            <div key={r.to}>
              {(i === 0 || res[i - 1].kind !== r.kind) && <div className="grp">{r.kind === 'Club' ? 'Clubes' : 'Jugadores'}</div>}
              <a href={r.to} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={onClose}>
                <Crest url={r.logo} name={r.name} size={28} />
                <span>
                  <b>{r.name}</b>
                  <small>{r.sub}</small>
                </span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
