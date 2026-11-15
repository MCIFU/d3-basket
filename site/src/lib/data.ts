/** Tipos y carga de los JSON que genera tools/site/export.ts. */
import { useEffect, useState } from 'react'
import { BUCKETS, bucketOf } from './bucket'

// ───────────────────────── Tipos ─────────────────────────
export interface Zone {
  from: number
  to: number
  kind: 'up' | 'playoff' | 'down'
  label: string
}
export interface EdRef {
  id: number
  y: number
  label: string
  teams: number
  games: number
  fin: number
}
export interface Comp {
  code: string
  name: string
  short: string | null
  country: string
  tier: number | null
  division: string | null
  logo: string | null
  color: string | null
  color2: string | null
  zones: Zone[]
  eds: EdRef[]
}
export interface Meta {
  updated: string | null
  comps: Comp[]
}
export interface TeamE {
  id: number
  club: string
  name: string
  short: string | null
  abbr: string | null
  logo: string | null
  c1: string | null
  c2: string | null
  g: string | null
  parent: string | null
}
export interface Stand {
  t: number
  g: string | null
  pos: number
  pj: number
  w: number
  l: number
  pf: number
  pa: number
  form: string
}
export interface GameE {
  id: string
  ph: string
  r: number | null
  rn: string | null
  d: string | null
  h: number
  a: number
  hs: number | null
  as: number | null
  st: 'f' | 's' | 'p'
  box: number
  ar: string | null
}
/** Línea de estadística: ver S para los índices. */
export type Line = (number | null)[]
export interface StatE {
  p: string
  t: number
  gp: number
  gs: number
  s: Line
}
/** [nombre, foto, foto recortada, posición, nacionalidad, nacimiento, altura] */
export type PlLite = [string, string | null, string | null, string | null, string | null, string | null, number | null]
export interface EdFile {
  id: number
  code: string
  y: number
  label: string
  last: string | null
  teams: TeamE[]
  stand: Stand[]
  games: GameE[]
  stats: StatE[]
  pl: Record<string, PlLite>
}
/** Equipo resumido: nombre, corto, siglas, escudo, club, colores. */
export interface TL {
  n: string
  s: string | null
  a: string | null
  l: string | null
  c: string
  c1: string | null
  c2: string | null
}
export interface Season {
  y: number
  code: string
  ed: number | null
  t: number | null
  team?: string
  club?: string | null
  logo?: string | null
  sec: 'liga' | 'filial' | 'copa' | 'europa' | 'seleccion' | 'formacion'
  gp: number
  gs: number
  w: number
  s: Line
  src: 'box' | 'acb'
}
/** [partido, edición, fecha, equipo, rival, local, puntos equipo, puntos rival, titular, ...línea] */
export type LogRow = [string, number, string | null, number, number, number, number, number, number, ...Line]
export interface PlayerRec {
  ref: string
  name: string
  first: string | null
  last: string | null
  full: string | null
  birth: string | null
  place: string | null
  nat: string | null
  h: number | null
  w: number | null
  pos: string | null
  posc: string | null
  photo: string | null
  cut: string | null
  body: string | null
  socials: Record<string, string>
  cur: { t: number; ed: number; code: string; y: number; num: string | null; active: number } | null
  seasons: Season[]
  log: LogRow[]
  tm: Record<number, TL>
  stints: [number, string, string, string | null, string | null][]
  records: Record<string, { value: number; date?: string; home?: string; away?: string; gameRef?: string }> | null
}
/** [jugador, dorsal, posición, activo, licencia, ...PlLite] */
export type RosterRow = [string, string | null, string | null, number, string | null, ...PlLite]
export interface ClubRec {
  ref: string
  name: string
  short: string | null
  abbr: string | null
  city: string | null
  country: string | null
  founded: number | null
  arena: string | null
  arenaCap: number | null
  arenaPhoto: string | null
  web: string | null
  president: string | null
  socials: Record<string, string>
  history: string | null
  logo: string | null
  c1: string | null
  c2: string | null
  parent: [string, string] | null
  filiales: [string, string, string | null][]
  teams: { t: number; ed: number; y: number; code: string; name: string; logo: string | null }[]
  rosters: Record<number, RosterRow[]>
  staff: Record<number, [string, string, string | null][]>
  /** [competición, año, etiqueta, campeón (1) o finalista (0), rival, resultado] */
  honours: [string, number, string, number, string | null, string | null][]
}
/** [jugador, dorsal, titular, ...línea] */
export type BoxRow = [string, string, number, ...Line]
export interface GameRec {
  ed: number
  per: [number, number][]
  att: number | null
  ar: string | null
  refs: string[]
  teams: Record<number, { coach: string | null; lines: BoxRow[] }>
  names: Record<string, [string, string | null, string | null]>
}
export interface DayGame {
  id: string
  ed: number
  code: string
  rn: string | null
  d: string
  h: number
  a: number
  hs: number | null
  as: number | null
  st: 'f' | 's' | 'p'
  box: number
}
export interface Days {
  at: string
  games: DayGame[]
  teams: Record<number, TL>
  best: { p: string; g: string; code: string; t: number; opp: number; d: string; won: boolean; pts: number; reb: number; ast: number; val: number }[]
  pl: Record<string, PlLite>
}
export interface SearchIdx {
  p: [string, string, string | null, string | null, number | null, string | null][]
  c: [string, string, string | null, string | null, number | null][]
}

// ───────────────────────── Índices de la línea de estadística ─────────────────────────
export const S = { sec: 0, pts: 1, f2m: 2, f2a: 3, f3m: 4, f3a: 5, ftm: 6, fta: 7, oreb: 8, dreb: 9, reb: 10, ast: 11, stl: 12, blk: 13, tov: 14, pf: 15, fd: 16, pm: 17, pir: 18 } as const
/** Desplazamiento de la línea dentro de LogRow y BoxRow. */
export const LOG0 = 9
export const BOX0 = 3

// ───────────────────────── Carga con caché ─────────────────────────
const cache = new Map<string, Promise<unknown>>()
export function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`./d/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}
export const loadMeta = () => load<Meta>('meta.json')
export const loadEd = (id: number) => load<EdFile>(`ed/${id}.json`)
export const loadDays = () => load<Days>('days.json')
export const loadSearch = () => load<SearchIdx>('search.json')
export const loadPlayer = async (ref: string) => (await load<Record<string, PlayerRec>>(`p/${bucketOf(ref, BUCKETS.p)}.json`))[ref]
export const loadClub = async (ref: string) => (await load<Record<string, ClubRec>>(`c/${bucketOf(ref, BUCKETS.c)}.json`))[ref]
export const loadGame = async (ref: string) => (await load<Record<string, GameRec>>(`g/${bucketOf(ref, BUCKETS.g)}.json`))[ref]

/** Hook de carga: undefined mientras carga, null si no existe, Error si falla. */
export function useLoad<T>(fn: () => Promise<T | undefined>, deps: unknown[]): T | undefined | null | Error {
  const [state, set] = useState<T | undefined | null | Error>(undefined)
  useEffect(() => {
    let live = true
    set(undefined)
    fn().then(
      (v) => live && set(v ?? null),
      (e) => live && set(e instanceof Error ? e : new Error(String(e)))
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export const compOf = (meta: Meta, code: string) => meta.comps.find((c) => c.code === code)
