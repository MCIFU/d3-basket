/** Enrutado por almohadilla (#/jugador/...): funciona en cualquier alojamiento estático y en local. */
import { useEffect, useState } from 'react'

export interface Route {
  path: string[]
  query: URLSearchParams
}
const parse = (): Route => {
  const h = location.hash.replace(/^#/, '') || '/'
  const [p, q = ''] = h.split('?')
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) }
}
export function useRoute() {
  const [r, set] = useState(parse)
  useEffect(() => {
    const on = () => {
      set(parse())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}
export const go = (to: string) => {
  location.hash = to
}
/** Cambia la consulta sin volver arriba (pestañas, filtros). */
export const setQuery = (k: string, v: string | null) => {
  const r = parse()
  if (v == null) r.query.delete(k)
  else r.query.set(k, v)
  const qs = r.query.toString()
  history.replaceState(null, '', `#/${r.path.map(encodeURIComponent).join('/')}${qs ? '?' + qs : ''}`)
  window.dispatchEvent(new Event('querychange'))
}
export function useQuery(k: string, def: string) {
  const [v, set] = useState(() => parse().query.get(k) ?? def)
  useEffect(() => {
    const on = () => set(parse().query.get(k) ?? def)
    window.addEventListener('querychange', on)
    window.addEventListener('hashchange', on)
    return () => {
      window.removeEventListener('querychange', on)
      window.removeEventListener('hashchange', on)
    }
  }, [k, def])
  return [v, (x: string) => setQuery(k, x === def ? null : x)] as const
}
export const href = {
  home: () => '#/',
  comp: (code: string, y?: number) => `#/liga/${code}${y ? `/${y}` : ''}`,
  club: (ref: string, y?: number) => `#/club/${encodeURIComponent(ref)}${y ? `/${y}` : ''}`,
  player: (ref: string) => `#/jugador/${encodeURIComponent(ref)}`,
  game: (ref: string) => `#/partido/${encodeURIComponent(ref)}`,
  h2h: (a: string, b: string) => `#/vs/${encodeURIComponent(a)}/${encodeURIComponent(b)}`
}
