/** Cálculos sobre una edición: jugadores y equipos agregados. */
import type { EdFile, GameE, Line, TeamE } from './data'
import { S, type EdFile as Ed } from './data'
import { n1, per, ts, val } from './fmt'

export interface PAgg {
  p: string
  t: number
  teams: number[]
  gp: number
  gs: number
  s: number[]
}
/** Estadística acumulada por jugador (sumando sus equipos) o por jugador en un equipo. */
export function players(ed: EdFile, team?: number): PAgg[] {
  const m = new Map<string, PAgg>()
  for (const st of ed.stats) {
    if (team != null && st.t !== team) continue
    const a: PAgg = m.get(st.p) ?? { p: st.p, t: st.t, teams: [], gp: 0, gs: 0, s: new Array(19).fill(0) }
    a.gp += st.gp
    a.gs += st.gs
    a.teams.push(st.t)
    a.t = st.t
    st.s.forEach((v, i) => (a.s[i] += v ?? 0))
    m.set(st.p, a)
  }
  return [...m.values()]
}
/** Mínimo de partidos para entrar en los rankings: el 40 % de los partidos del líder en partidos. */
export const minGames = (rows: { gp: number }[]) => Math.max(1, Math.floor(Math.max(0, ...rows.map((r) => r.gp)) * 0.4))

export interface TAgg {
  team: TeamE
  gp: number
  w: number
  l: number
  pf: number
  pa: number
  hw: number
  hl: number
  aw: number
  al: number
  s: number[]
  last: GameE[]
}
export function teams(ed: EdFile): Map<number, TAgg> {
  const m = new Map<number, TAgg>(ed.teams.map((t) => [t.id, { team: t, gp: 0, w: 0, l: 0, pf: 0, pa: 0, hw: 0, hl: 0, aw: 0, al: 0, s: new Array(19).fill(0), last: [] }]))
  for (const g of ed.games) {
    if (g.st !== 'f' || g.hs == null || g.as == null) continue
    for (const [id, home] of [
      [g.h, true],
      [g.a, false]
    ] as const) {
      const a = m.get(id)
      if (!a) continue
      const my = home ? g.hs : g.as
      const op = home ? g.as : g.hs
      a.gp++
      a.pf += my
      a.pa += op
      const won = my > op
      won ? a.w++ : a.l++
      if (home) won ? a.hw++ : a.hl++
      else won ? a.aw++ : a.al++
      a.last.push(g)
    }
  }
  for (const st of ed.stats) {
    const a = m.get(st.t)
    if (a) st.s.forEach((v, i) => (a.s[i] += v ?? 0))
  }
  return m
}

/** Jornada a mostrar: la de los partidos más recientes jugados o, si no hay, la primera. */
export function currentRound(games: GameE[]) {
  const now = Date.now()
  const past = games.filter((g) => g.d && Date.parse(g.d) <= now + 12 * 3600_000)
  const ref = past.at(-1) ?? games[0]
  return ref ? roundKey(ref) : ''
}
export const roundKey = (g: GameE) => `${g.ph}:${g.r ?? g.rn ?? 0}`
export const roundName = (g: GameE) => g.rn ?? (g.ph === 'regular' ? `Jornada ${g.r}` : g.ph === 'playoff' ? `Playoff ${g.r ?? ''}` : g.ph === 'final' ? 'Final' : g.ph === 'final_four' ? 'Final Four' : g.ph === 'playin' ? 'Play-in' : (g.r ?? '').toString())
export const avgLine = (s: Line, gp: number) => per(s, gp)

/** Percentiles del jugador frente a su liga (misma edición). */
export function percentiles(ed: Ed, ref: string) {
  const byP = new Map<string, { gp: number; s: number[] }>()
  for (const st of ed.stats) {
    const a = byP.get(st.p) ?? { gp: 0, s: new Array(19).fill(0) }
    a.gp += st.gp
    st.s.forEach((v, i) => (a.s[i] += v ?? 0))
    byP.set(st.p, a)
  }
  const me = byP.get(ref)
  if (!me || !me.gp) return null
  const maxGp = Math.max(...[...byP.values()].map((a) => a.gp))
  const pool = [...byP.entries()].filter(([p, a]) => p === ref || (a.gp >= Math.max(3, Math.floor(maxGp * 0.3)) && a.s[S.sec] / a.gp >= 8 * 60))
  const metrics: { k: string; short: string; label: string; f: (a: { gp: number; s: number[] }) => number | null; fmt: (v: number) => string; lower?: boolean }[] = [
    { k: 'pts', short: 'Puntos', label: 'Puntos', f: (a) => a.s[S.pts] / a.gp, fmt: n1 },
    { k: 'val', short: 'Valor.', label: 'Valoración', f: (a) => val(a.s) / a.gp, fmt: n1 },
    { k: 'ts', short: 'TS%', label: '% tiro verdadero', f: (a) => ts(a.s), fmt: (v) => `${n1(v * 100)} %` },
    { k: 'p3', short: 'Triples', label: '% triples', f: (a) => (a.s[S.f3a] >= 10 ? a.s[S.f3m] / a.s[S.f3a] : null), fmt: (v) => `${n1(v * 100)} %` },
    { k: 'ast', short: 'Asist.', label: 'Asistencias', f: (a) => a.s[S.ast] / a.gp, fmt: n1 },
    { k: 'reb', short: 'Rebotes', label: 'Rebotes', f: (a) => a.s[S.reb] / a.gp, fmt: n1 },
    { k: 'stl', short: 'Robos', label: 'Robos', f: (a) => a.s[S.stl] / a.gp, fmt: n1 },
    { k: 'blk', short: 'Tapones', label: 'Tapones', f: (a) => a.s[S.blk] / a.gp, fmt: n1 },
    { k: 'tov', short: 'Pérdidas', label: 'Pérdidas', f: (a) => a.s[S.tov] / a.gp, fmt: n1, lower: true }
  ]
  const out = metrics.map((m) => {
    const v = m.f(me)
    if (v == null) return null
    const vals = pool.map(([, a]) => m.f(a)).filter((x): x is number => x != null)
    const below = vals.filter((x) => (m.lower ? x > v : x < v)).length
    const better = vals.filter((x) => (m.lower ? x < v : x > v)).length
    return { ...m, v, pct: Math.round((100 * below) / Math.max(1, vals.length - 1)), rank: better + 1, of: vals.length }
  })
  return { items: out.filter((x): x is NonNullable<typeof x> => x != null), pool: pool.length, me }
}

