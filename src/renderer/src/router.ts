/**
 * Rutas con hash (#/jugador/sergio-llull-20201774). Funcionan igual en la web
 * (Netlify, sin reglas de servidor) y en Electron (file://), y como son enlaces
 * reales se pueden abrir en otra pestaña con el botón central o Ctrl+clic.
 */
import { useEffect, useState } from 'react'

export type Route =
  | { page: 'home' }
  | { page: 'leagues' }
  | { page: 'league'; code: string; tab?: string; year?: number }
  | { page: 'clubs' }
  | { page: 'club'; ref: string; tab?: string; year?: number }
  | { page: 'players' }
  | { page: 'compare'; a?: string; b?: string }
  | { page: 'player'; ref: string; tab?: string }
  | { page: 'game'; ref: string }
  | { page: 'scouting' }
  | { page: 'report'; playerRef: string; reportId?: number }
  | { page: 'data' }
  | { page: 'notfound' }

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "sergio-llull-20201774" → "20201774" (las referencias no contienen guiones). */
const refFrom = (segment = '') => segment.split('-').pop() ?? ''

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const params = new URLSearchParams(query)
  const year = params.get('t') ? Number(params.get('t')) : undefined
  const [a, b, c, d] = parts
  switch (a) {
    case undefined:
      return { page: 'home' }
    case 'ligas':
      return { page: 'leagues' }
    case 'liga':
      return b ? { page: 'league', code: b.toUpperCase(), tab: c, year } : { page: 'leagues' }
    case 'equipos':
      return { page: 'clubs' }
    case 'equipo':
      return b ? { page: 'club', ref: refFrom(b), tab: c, year } : { page: 'clubs' }
    case 'jugadores':
      return { page: 'players' }
    case 'comparar':
      return { page: 'compare', a: b && b !== '_' ? refFrom(b) : undefined, b: c ? refFrom(c) : undefined }
    case 'jugador':
      return b ? { page: 'player', ref: refFrom(b), tab: c } : { page: 'players' }
    case 'partido':
      return b ? { page: 'game', ref: b } : { page: 'notfound' }
    case 'scouting':
      if (b === 'nuevo' && c) return { page: 'report', playerRef: refFrom(c) }
      if (b === 'informe' && c && d) return { page: 'report', playerRef: refFrom(d), reportId: Number(c) }
      return { page: 'scouting' }
    case 'datos':
      return { page: 'data' }
    default:
      return { page: 'notfound' }
  }
}

const withYear = (path: string, year?: number) => (year ? `${path}?t=${year}` : path)

export const href = {
  home: () => '#/',
  leagues: () => '#/ligas',
  league: (code: string, tab?: string, year?: number) =>
    withYear(`#/liga/${code.toLowerCase()}${tab ? `/${tab}` : ''}`, year),
  clubs: () => '#/equipos',
  club: (ref: string, name: string, tab?: string, year?: number) =>
    withYear(`#/equipo/${slugify(name)}-${ref}${tab ? `/${tab}` : ''}`, year),
  players: () => '#/jugadores',
  /** Los huecos vacíos se marcan con '_' para que B no pase a ser A. */
  compare: (a?: string, b?: string) => (a || b ? `#/comparar/${a ?? '_'}${b ? `/${b}` : ''}` : '#/comparar'),
  player: (ref: string, name: string, tab?: string) => `#/jugador/${slugify(name)}-${ref}${tab ? `/${tab}` : ''}`,
  game: (ref: string) => `#/partido/${ref}`,
  scouting: () => '#/scouting',
  newReport: (playerRef: string, name: string) => `#/scouting/nuevo/${slugify(name)}-${playerRef}`,
  report: (id: number, playerRef: string, name: string) => `#/scouting/informe/${id}/${slugify(name)}-${playerRef}`,
  data: () => '#/datos'
}

export function navigate(to: string) {
  window.location.hash = to.replace(/^#/, '')
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    let prev = parseHash(window.location.hash)
    const onChange = () => {
      const next = parseHash(window.location.hash)
      // Cambiar de pestaña dentro de la misma ficha no debe saltar arriba.
      const samePage = next.page === prev.page && (next as { ref?: string }).ref === (prev as { ref?: string }).ref
      if (!samePage) window.scrollTo({ top: 0 })
      prev = next
      setRoute(next)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
