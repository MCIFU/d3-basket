/** Cálculos sobre una edición: jugadores y equipos agregados. */
import type { EdFile, GameE, Line, TeamE } from './data'
import { per } from './fmt'

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
