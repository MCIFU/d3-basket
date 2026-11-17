/** Favoritos (jugadores y clubes) guardados en este navegador. */
import { useEffect, useState } from 'react'

export interface Fav {
  kind: 'p' | 'c'
  ref: string
  name: string
  img: string | null
}
const KEY = 'd3-favs'
const read = (): Fav[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}
export function toggleFav(f: Fav) {
  const all = read()
  const i = all.findIndex((x) => x.kind === f.kind && x.ref === f.ref)
  if (i >= 0) all.splice(i, 1)
  else all.unshift(f)
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 40)))
  } catch {}
  window.dispatchEvent(new Event('favs'))
}
export function useFavs() {
  const [v, set] = useState(read)
  useEffect(() => {
    const on = () => set(read())
    window.addEventListener('favs', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('favs', on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return v
}
