/**
 * Exporta la base de datos a los ficheros JSON que lee la web nueva (site/).
 * Cada página baja solo lo que muestra:
 *   d/meta.json          competiciones y ediciones
 *   d/ed/{id}.json       una edición: equipos, clasificación, partidos y estadística de cada jugador
 *   d/p/{cubo}.json      jugadores (ficha, temporadas y todos sus partidos), agrupados por cubo
 *   d/c/{cubo}.json      clubes (datos, temporadas, plantillas y cuerpo técnico)
 *   d/g/{cubo}.json      boxscores de los partidos
 *   d/search.json        índice del buscador
 * Los cubos (hash de la referencia) mantienen el número de ficheros por debajo del límite
 * de Cloudflare Pages (20.000) sin obligar a bajar todo.
 *
 * Uso: tsx tools/site/export.ts --db data/d3basket.db [--out public/d]
 */
import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Queries } from '../../src/db/queries'
import { LEAGUES } from '../../src/shared/leagues'
import { BUCKETS, bucketOf } from '../../site/src/lib/bucket'
import { country } from '../../site/src/lib/countries'

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? process.argv[i + 1] : d
}
const dbPath = arg('--db', 'data/d3basket.db')!
const out = arg('--out', 'public/d')!
const t0 = Date.now()
const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${m}`)

const db = new Database(dbPath, { readonly: true })
const q = new Queries(db as never)
const all = <T = any>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as T[]

// Se sobrescriben los ficheros (los nombres son estables); borrar la carpeta confundiría al servidor de desarrollo.
for (const d of ['ed', 'p', 'c', 'g']) mkdirSync(join(out, d), { recursive: true })
const write = (rel: string, data: unknown) => writeFileSync(join(out, rel), JSON.stringify(data))

// ───────────────────────── Referencias estables ─────────────────────────
const playerRef = new Map(all<{ player_id: number; ref: string }>('SELECT player_id, ref FROM v_player_ref').map((r) => [r.player_id, r.ref]))
const clubRef = new Map(all<{ club_id: number; ref: string }>('SELECT club_id, ref FROM v_club_ref').map((r) => [r.club_id, r.ref]))
const gameRef = new Map(all<{ game_id: number; ref: string }>('SELECT game_id, ref FROM v_game_ref').map((r) => [r.game_id, r.ref]))
log(`referencias: ${playerRef.size} jugadores, ${clubRef.size} clubes, ${gameRef.size} partidos`)

// ───────────────────────── Competiciones y ediciones ─────────────────────────
interface Ed { id: number; code: string; y: number; label: string; teams: number; games: number; fin: number; last: string | null }
const eds = all<Ed>(
  `SELECT cs.id, c.code, s.start_year AS y, s.label, cs.last_synced_at AS last,
          (SELECT COUNT(*) FROM teams t WHERE t.competition_season_id = cs.id) AS teams,
          (SELECT COUNT(*) FROM games g WHERE g.competition_season_id = cs.id) AS games,
          (SELECT COUNT(*) FROM games g WHERE g.competition_season_id = cs.id AND g.status = 'finished') AS fin
   FROM competition_seasons cs JOIN competitions c ON c.id = cs.competition_id JOIN seasons s ON s.id = cs.season_id`
)
const edById = new Map(eds.map((e) => [e.id, e]))
const comps = all(`SELECT code, name, short_name, country, tier, organizer FROM competitions`).map((c: any) => {
  const th = LEAGUES[c.code]
  return {
    code: c.code,
    name: th?.name ?? c.name,
    short: c.short_name,
    country: c.country,
    tier: c.tier,
    division: th?.division ?? null,
    logo: th?.logo ?? null,
    color: th?.color ?? null,
    color2: th?.color2 ?? null,
    zones: th?.zones ?? [],
    eds: eds.filter((e) => e.code === c.code).sort((a, b) => b.y - a.y).map(({ id, y, label, teams, games, fin }) => ({ id, y, label, teams, games, fin }))
  }
})
const countryOrder = (c: string) => (c === 'ES' ? 0 : c === 'EU' ? 1 : 2)
comps.sort((a, b) => countryOrder(a.country) - countryOrder(b.country) || a.country.localeCompare(b.country) || (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name))
const updated = all<{ v: string }>(`SELECT MAX(last_synced_at) AS v FROM competition_seasons`)[0]?.v
write('meta.json', { updated, buckets: BUCKETS, comps })
log(`meta: ${comps.length} competiciones, ${eds.length} ediciones`)

// ───────────────────────── Clubes y equipos ─────────────────────────
const clubs = all(`SELECT * FROM clubs`)
// Colores oficiales donde los sacados del escudo no representan al club.
const COLOR_FIX: [RegExp, string, string][] = [
  [/^Real Madrid$/, '#febe10', '#1f1d5a'],
  [/^Fenerbah/i, '#f3e63c', '#0b1e3f'],
  [/^Surne Bilbao/, '#b8bcc2', '#141414']
]
for (const c of clubs as any[]) {
  const fix = COLOR_FIX.find(([re]) => re.test(c.name))
  if (fix) (c.primary_color = fix[1]), (c.secondary_color = fix[2])
}
const clubById = new Map(clubs.map((c: any) => [c.id, c]))
interface TeamOut { id: number; ed: number; club: string; name: string; short: string | null; abbr: string | null; logo: string | null; c1: string | null; c2: string | null; g: string | null; parent: string | null }
const teams = new Map<number, TeamOut>(
  all(`SELECT * FROM teams`).map((t: any) => {
    const cl: any = clubById.get(t.club_id) ?? {}
    const parent = cl.parent_club_id ? clubRef.get(cl.parent_club_id) ?? null : null
    return [t.id, { id: t.id, ed: t.competition_season_id, club: clubRef.get(t.club_id) ?? `i${t.club_id}`, name: t.name, short: t.short_name ?? cl.short_name ?? null, abbr: t.abbreviation ?? cl.abbreviation ?? null, logo: t.logo_url ?? cl.logo_url ?? null, c1: cl.primary_color ?? t.primary_color ?? null, c2: cl.secondary_color ?? null, g: t.group_name, parent }]
  })
)
const teamLite = (id: number) => {
  const t = teams.get(id)!
  return { n: t.name, s: t.short, a: t.abbr, l: t.logo, c: t.club, c1: t.c1, c2: t.c2 }
}

// ───────────────────────── Jugadores ─────────────────────────
const players = all(`SELECT * FROM players`)
// Nacionalidad unificada en español (cada fuente la escribe a su manera: USA, EE.UU., United States…).
for (const p of players as any[]) p.nationality = country(p.nationality)?.name ?? p.nationality
// Sin nacionalidad en su fuente (ligas extranjeras): la de otra ficha de la misma persona
// (mismo nombre y misma fecha de nacimiento), p. ej. un español con pasado en la ACB o la FEB.
{
  const key = (p: any) => (p.birth_date ? `${(p.full_name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')}|${p.birth_date.slice(0, 10)}` : null)
  const known = new Map<string, string>()
  for (const p of players as any[]) if (p.nationality && key(p)) known.set(key(p)!, p.nationality)
  let filled = 0
  for (const p of players as any[]) if (!p.nationality && key(p) && known.has(key(p)!)) (p.nationality = known.get(key(p)!)), filled++
  // Sin fecha en una de las dos fichas: mismo nombre completo (dos palabras o más), que solo tenga una
  // persona con nacionalidad, y mismo año de nacimiento si las dos lo tienen.
  const nm = (p: any) => (p.full_name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
  const byName = new Map<string, any[]>()
  for (const p of players as any[]) if (p.nationality && nm(p).split(' ').length >= 2) byName.set(nm(p), [...(byName.get(nm(p)) ?? []), p])
  for (const p of players as any[]) {
    if (p.nationality) continue
    const c = byName.get(nm(p))
    if (c?.length !== 1) continue
    const y1 = p.birth_date?.slice(0, 4)
    const y2 = c[0].birth_date?.slice(0, 4)
    if (y1 && y2 && y1 !== y2) continue
    p.nationality = c[0].nationality
    filled++
  }
  log(`nacionalidad completada desde otra ficha: ${filled} jugadores`)
}
const pById = new Map(players.map((p: any) => [p.id, p]))
const displayName = (p: any) => p.known_as || p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()

// ───────────────────────── Partidos ─────────────────────────
const rounds = new Map(all(`SELECT id, phase, number, name FROM rounds`).map((r: any) => [r.id, r]))
const games = all(`SELECT * FROM games`)
const gById = new Map(games.map((g: any) => [g.id, g]))
const periods = new Map<number, number[][]>()
for (const r of all<{ game_id: number; period: number; home_points: number; away_points: number }>(`SELECT * FROM game_period_scores ORDER BY game_id, period`)) {
  if (!periods.has(r.game_id)) periods.set(r.game_id, [])
  periods.get(r.game_id)!.push([r.home_points, r.away_points])
}
const coaches = new Map<string, string>()
for (const r of all<{ game_id: number; team_id: number; head_coach: string | null }>(`SELECT game_id, team_id, head_coach FROM team_game_stats WHERE period = 0 AND head_coach IS NOT NULL`)) coaches.set(`${r.game_id}:${r.team_id}`, r.head_coach!)
log(`partidos: ${games.length}`)

// ───────────────────────── Recorrido único por las líneas de estadística ─────────────────────────
// Línea compacta: [sec, pts, f2m, f2a, f3m, f3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, pf, fd, pm, pir]
const STAT = 'seconds, points, fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, blk, tov, pf, fouls_drawn, plus_minus, pir'
type Agg = { p: string; t: number; gp: number; gs: number; s: number[] }
const N = 19
const edStats = new Map<number, Map<string, Agg>>() // edición → jugador:equipo → acumulado
const pLog = new Map<number, any[]>() // jugador → partidos
const gBox = new Map<number, Map<number, any[]>>() // partido → equipo → líneas
let lines = 0
for (const r of db.prepare(`SELECT game_id, player_id, team_id, jersey_number, is_starter, ${STAT} FROM player_game_stats WHERE period = 0`).iterate() as Iterable<any>) {
  lines++
  const g: any = gById.get(r.game_id)
  if (!g) continue
  const ref = playerRef.get(r.player_id)!
  const s = [r.seconds ?? 0, r.points ?? 0, r.fg2m ?? 0, r.fg2a ?? 0, r.fg3m ?? 0, r.fg3a ?? 0, r.ftm ?? 0, r.fta ?? 0, r.oreb ?? 0, r.dreb ?? 0, r.reb ?? 0, r.ast ?? 0, r.stl ?? 0, r.blk ?? 0, r.tov ?? 0, r.pf ?? 0, r.fouls_drawn ?? 0, r.plus_minus ?? null,
    // Sin valoración en la fuente (ESPN, algunas ligas): la fórmula europea con lo que publica.
    r.pir ?? (r.points ?? 0) + (r.reb ?? 0) + (r.ast ?? 0) + (r.stl ?? 0) + (r.blk ?? 0) - ((r.fg2a ?? 0) - (r.fg2m ?? 0)) - ((r.fg3a ?? 0) - (r.fg3m ?? 0)) - ((r.fta ?? 0) - (r.ftm ?? 0)) - (r.tov ?? 0) - (r.pf ?? 0) + (r.fouls_drawn ?? 0)]
  // Boxscore
  if (!gBox.has(r.game_id)) gBox.set(r.game_id, new Map())
  const box = gBox.get(r.game_id)!
  if (!box.has(r.team_id)) box.set(r.team_id, [])
  box.get(r.team_id)!.push([ref, r.jersey_number ?? '', r.is_starter ? 1 : 0, ...s])
  if (g.status !== 'finished') continue
  // Partido del jugador
  const home = g.home_team_id === r.team_id
  if (!pLog.has(r.player_id)) pLog.set(r.player_id, [])
  pLog.get(r.player_id)!.push([gameRef.get(g.id), g.competition_season_id, g.scheduled_at, r.team_id, home ? g.away_team_id : g.home_team_id, home ? 1 : 0, home ? g.home_score : g.away_score, home ? g.away_score : g.home_score, r.is_starter ? 1 : 0, ...s])
  // Acumulado de la edición (solo partidos con minutos o anotación)
  if (!edStats.has(g.competition_season_id)) edStats.set(g.competition_season_id, new Map())
  const em = edStats.get(g.competition_season_id)!
  const k = `${ref}:${r.team_id}`
  if (!em.has(k)) em.set(k, { p: ref, t: r.team_id, gp: 0, gs: 0, s: new Array(N).fill(0) })
  const a = em.get(k)!
  if ((r.seconds ?? 0) > 0 || (r.points ?? 0) > 0) a.gp++
  if (r.is_starter) a.gs++
  for (let i = 0; i < N; i++) a.s[i] += s[i] ?? 0
}
log(`líneas de estadística: ${lines}`)

// ───────────────────────── Ediciones ─────────────────────────
const plLite = (id: number) => {
  const p: any = pById.get(id)
  return [displayName(p), p.photo_url ?? null, p.photo_nobg_url ?? null, p.position_code ?? null, p.nationality ?? null, p.birth_date ?? null, p.height_cm ?? null]
}
const refToId = new Map([...playerRef].map(([id, r]) => [r, id]))
for (const e of eds) {
  const eTeams = [...teams.values()].filter((t) => t.ed === e.id)
  const stand = q.standings(e.id).map((s) => ({ t: s.team_id, g: s.group, pos: s.position, pj: s.played, w: s.won, l: s.lost, pf: s.points_for, pa: s.points_against, form: s.form.join('') }))
    // NCAA: solo los equipos de División I (con conferencia); los rivales de otras divisiones no clasifican.
    .filter((s) => e.code !== 'NCAA' || s.g)
  const eg = games.filter((g: any) => g.competition_season_id === e.id).map((g: any) => {
    const rd: any = rounds.get(g.round_id)
    return { id: gameRef.get(g.id), ph: rd?.phase ?? 'regular', r: rd?.number ?? null, rn: rd?.name ?? null, d: g.scheduled_at, h: g.home_team_id, a: g.away_team_id, hs: g.home_score, as: g.away_score, st: g.status === 'finished' ? 'f' : g.status === 'postponed' ? 'p' : 's', box: gBox.has(g.id) ? 1 : 0, ar: g.arena ?? null }
  }).sort((a, b) => (a.d ?? '9').localeCompare(b.d ?? '9'))
  const stats = [...(edStats.get(e.id)?.values() ?? [])].filter((a) => a.gp > 0).map((a) => ({ p: a.p, t: a.t, gp: a.gp, gs: a.gs, s: a.s }))
  const pl: Record<string, unknown[]> = {}
  for (const s of stats) pl[s.p] = plLite(refToId.get(s.p)!)
  // Mejores actuaciones individuales de la temporada en un partido (récords de la edición).
  const perf: { p: string; g: string; t: number; opp: number; d: string; s: (number | null)[] }[] = []
  for (const g of games as any[]) {
    if (g.competition_season_id !== e.id || g.status !== 'finished') continue
    for (const [tid, ls] of gBox.get(g.id) ?? []) for (const l of ls) perf.push({ p: l[0], g: gameRef.get(g.id)!, t: tid, opp: g.home_team_id === tid ? g.away_team_id : g.home_team_id, d: g.scheduled_at, s: l.slice(3) })
  }
  const valOf = (x: (number | null)[]) => x[18] ?? (x[1] ?? 0) + (x[10] ?? 0) + (x[11] ?? 0) + (x[12] ?? 0) + (x[13] ?? 0) - ((x[3] ?? 0) - (x[2] ?? 0)) - ((x[5] ?? 0) - (x[4] ?? 0)) - ((x[7] ?? 0) - (x[6] ?? 0)) - (x[14] ?? 0) - (x[15] ?? 0)
  const top: Record<string, unknown[]> = {}
  for (const [k, f] of [['pts', (x: any) => x[1]], ['val', valOf], ['reb', (x: any) => x[10]], ['ast', (x: any) => x[11]], ['f3m', (x: any) => x[4]], ['stl', (x: any) => x[12]]] as const) {
    top[k] = perf
      .map((x) => ({ ...x, v: (f as (x: any) => number)(x.s) ?? 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 8)
      .map(({ p, g, t, opp, d, v }) => {
        pl[p] ??= plLite(refToId.get(p)!)
        return { p, g, t, opp, d, v }
      })
  }
  write(`ed/${e.id}.json`, { id: e.id, code: e.code, y: e.y, label: e.label, last: e.last, teams: eTeams.map(({ ed, ...t }) => t), stand, games: eg, stats, pl, top })
}
log(`ediciones: ${eds.length} ficheros`)

// ───────────────────────── Jugadores (cubos) ─────────────────────────
const SECTION = (code: string, parent: string | null) =>
  /^CESA_/.test(code) ? 'seleccion' : /^CE_/.test(code) ? 'formacion' : ['EUROLEAGUE', 'EUROCUP', 'BCL'].includes(code) ? 'europa' : /COPA/.test(code) ? 'copa' : parent ? 'filial' : 'liga'
const lastRoster = new Map<number, any>()
for (const r of all(
  // La última fila gana: temporada más reciente, activo y, a igualdad, la liga nacional sobre Europa y la Copa.
  `SELECT r.player_id, r.team_id, r.jersey_number, r.position, r.is_active, s.start_year
   FROM roster_entries r JOIN teams t ON t.id = r.team_id JOIN competition_seasons cs ON cs.id = t.competition_season_id
   JOIN seasons s ON s.id = cs.season_id JOIN competitions co ON co.id = cs.competition_id
   ORDER BY s.start_year, r.is_active, co.code IN ('EUROLEAGUE', 'EUROCUP', 'BCL', 'COPA_ESPANA', 'COPA_REY', 'SUPERCOPA') DESC, co.tier IS NULL DESC`
)) lastRoster.set(r.player_id, r)
const psl = new Map<number, any[]>()
for (const r of all(`SELECT * FROM player_season_lines`)) {
  if (!psl.has(r.player_id)) psl.set(r.player_id, [])
  psl.get(r.player_id)!.push(r)
}
const stints = new Map<number, any[]>()
for (const r of all(`SELECT * FROM player_stints ORDER BY season_start_year`)) {
  if (!stints.has(r.player_id)) stints.set(r.player_id, [])
  stints.get(r.player_id)!.push([r.season_start_year, r.competition, r.club_name, r.team_name, r.license])
}
// ───────────────────────── Títulos ─────────────────────────
const honours = all(`SELECT * FROM honours`)
/** Campeón y finalista de cada edición europea, desde su final (último partido de la Final Four o de la final). */
const euroFinals = new Map<number, { code: string; y: number; win: number; lose: number }>()
for (const e of eds.filter((x) => ['EUROLEAGUE', 'BCL', 'EUROCUP'].includes(x.code))) {
  const fin = (games as any[])
    .filter((g) => g.competition_season_id === e.id && g.status === 'finished' && ['final_four', 'final'].includes((rounds.get(g.round_id) as any)?.phase))
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const last = fin.at(-1)
  // Una Final Four tiene dos semifinales, tercer puesto y final (la última); con menos partidos no se sabe cuál es la final.
  if (last && fin.length >= 4) euroFinals.set(e.id, { code: e.code, y: e.y, win: last.home_score > last.away_score ? last.home_team_id : last.away_team_id, lose: last.home_score > last.away_score ? last.away_team_id : last.home_team_id })
}
// Ligas con playoff (NBA y ligas nacionales extranjeras): el campeón es el ganador del último partido de
// las eliminatorias, si la temporada llegó a la final (último partido entre abril y julio).
const KO_LEAGUES = ['NBA', 'LBA', 'BBL', 'LNB_ELITE', 'GBL', 'BSL']
for (const e of eds.filter((x) => KO_LEAGUES.includes(x.code))) {
  const ko = (games as any[])
    .filter((g) => g.competition_season_id === e.id && g.status === 'finished' && ['playoff', 'final', 'final_four'].includes((rounds.get(g.round_id) as any)?.phase))
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const last = ko.at(-1)
  const m = last ? Number(last.scheduled_at?.slice(5, 7)) : 0
  if (last && ko.length >= 3 && m >= 4 && m <= 7) euroFinals.set(e.id, { code: e.code, y: e.y, win: last.home_score > last.away_score ? last.home_team_id : last.away_team_id, lose: last.home_score > last.away_score ? last.away_team_id : last.home_team_id })
}
/** Medallas de la selección (tools/site/selecciones.mjs) por nombre normalizado. */
const normName = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const nt = new Map<string, { kind: string; y: number; medal: string; mvp: boolean }[]>()
for (const ev of JSON.parse(readFileSync(new URL('./selecciones.json', import.meta.url), 'utf8')) as any[])
  for (const pl of ev.players) {
    const k = normName(pl.name)
    if (!nt.has(k)) nt.set(k, [])
    nt.get(k)!.push({ kind: ev.kind, y: ev.year, medal: ev.medal, mvp: pl.mvp })
  }
/** Nombres posibles de un jugador para cruzarlo con la selección. */
const namesOf = (p: any) => {
  const out = new Set<string>()
  for (const n of [p.known_as, p.full_name, `${p.first_name ?? ''} ${p.last_name ?? ''}`]) if (n) out.add(normName(n))
  const f = normName(p.full_name ?? '').split(' ')
  if (f.length > 2) (out.add(`${f[0]} ${f[1]}`), out.add(`${f[0]} ${f.at(-2)}`))
  return [...out]
}
// Cada nombre de la selección se asigna a un único jugador español: si hay varios con ese nombre,
// al que tiene temporadas en la ACB o la EuroLeague y edad compatible con el torneo.
const topLevel = (id: number) => (psl.get(id)?.length ?? 0) > 0 || (pLog.get(id) ?? []).some((l) => ['ACB', 'EUROLEAGUE'].includes(edById.get(l[1])!.code))
const medalsOf = new Map<number, { kind: string; y: number; medal: string; mvp: boolean }[]>()
{
  const cands = new Map<string, any[]>()
  for (const p of players as any[]) {
    if (p.nationality !== 'España') continue
    for (const n of namesOf(p)) if (nt.has(n)) (cands.get(n) ?? cands.set(n, []).get(n)!).push(p)
  }
  for (const [n, ps] of cands) {
    const evs = nt.get(n)!
    const fits = (p: any) => !p.birth_date || evs.every((e) => e.y - Number(p.birth_date.slice(0, 4)) >= 16 && e.y - Number(p.birth_date.slice(0, 4)) <= 42)
    const uniq = [...new Map(ps.map((p) => [p.id, p])).values()].filter(fits)
    const top = uniq.filter((p) => topLevel(p.id))
    const pick = top.length === 1 ? top[0] : uniq.length === 1 ? uniq[0] : undefined
    if (pick && !medalsOf.has(pick.id)) medalsOf.set(pick.id, evs)
  }
}
/** Copas de Europa / EuroLeague de clubes españoles anteriores a las temporadas cargadas (año de inicio de temporada). */
const OLD_EL: [number, RegExp][] = (
  [
    [1963, /^Real Madrid$/],
    [1964, /^Real Madrid$/],
    [1966, /^Real Madrid$/],
    [1967, /^Real Madrid$/],
    [1973, /^Real Madrid$/],
    [1977, /^Real Madrid$/],
    [1979, /^Real Madrid$/],
    [1993, /Joventut/],
    [1994, /^Real Madrid$/],
    [2002, /^Barça$/],
    [2009, /^Barça$/],
    [2014, /^Real Madrid$/],
    [2017, /^Real Madrid$/]
  ] as [number, RegExp][]
).filter(([y]) => ![...euroFinals.values()].some((f) => f.code === 'EUROLEAGUE' && f.y === y)) // solo los años sin final en los datos

const pBuckets: Record<string, any>[] = Array.from({ length: BUCKETS.p }, () => ({}))
const search: { p: unknown[]; c: unknown[] } = { p: [], c: [] }
for (const p of players as any[]) {
  const ref = playerRef.get(p.id)!
  const logs = (pLog.get(p.id) ?? []).sort((a, b) => (a[2] ?? '').localeCompare(b[2] ?? ''))
  // Temporadas desde los boxscores: una por edición y equipo
  const seasonMap = new Map<string, any>()
  for (const l of logs) {
    const k = `${l[1]}:${l[3]}`
    if (!seasonMap.has(k)) {
      const e = edById.get(l[1])!
      const t = teams.get(l[3])!
      seasonMap.set(k, { y: e.y, code: e.code, ed: e.id, t: l[3], sec: SECTION(e.code, t.parent), gp: 0, gs: 0, w: 0, s: new Array(N).fill(0), src: 'box' })
    }
    const a = seasonMap.get(k)
    if (l[9] > 0 || l[10] > 0) a.gp++
    if (l[8]) a.gs++
    if (l[6] > l[7]) a.w++
    for (let i = 0; i < N; i++) a.s[i] += l[9 + i] ?? 0
  }
  const seasons = [...seasonMap.values()]
  // Temporadas oficiales de acb.com sin boxscores en la base (años anteriores)
  for (const r of psl.get(p.id) ?? []) {
    if (seasons.some((s) => s.code === r.competition_code && s.y === r.season_start_year)) continue
    const cl: any = r.club_id ? clubById.get(r.club_id) : undefined
    seasons.push({ y: r.season_start_year, code: r.competition_code, ed: null, t: null, team: r.team_name, club: r.club_id ? clubRef.get(r.club_id) : null, logo: cl?.logo_url ?? null, sec: SECTION(r.competition_code, null), gp: r.games, gs: 0, w: r.wins ?? 0, s: [r.seconds, r.points, r.fg2m, r.fg2a, r.fg3m, r.fg3a, r.ftm, r.fta, r.oreb, r.dreb, r.reb, r.ast, r.stl, r.blk, r.tov, r.pf, r.fouls_drawn, r.plus_minus, r.pir], src: 'acb' })
  }
  seasons.sort((a, b) => b.y - a.y)
  const tm: Record<number, unknown> = {}
  for (const l of logs) (tm[l[3]] ??= teamLite(l[3])), (tm[l[4]] ??= teamLite(l[4]))
  for (const s of seasons) if (s.t != null) tm[s.t] ??= teamLite(s.t)
  const lr = lastRoster.get(p.id)
  const lastLog = logs.at(-1)
  const lastSeason = seasons.find((s) => s.t != null)
  // Equipo actual: la plantilla más reciente o, si es más reciente, el último partido
  let cur: any = null
  if (lr && (!lastLog || edById.get(teams.get(lr.team_id)!.ed)!.y >= edById.get(lastLog[1])!.y)) {
    tm[lr.team_id] ??= teamLite(lr.team_id)
    const t = teams.get(lr.team_id)!
    cur = { t: lr.team_id, ed: t.ed, code: edById.get(t.ed)!.code, y: edById.get(t.ed)!.y, num: lr.jersey_number, active: lr.is_active }
  } else if (lastSeason) cur = { t: lastSeason.t, ed: lastSeason.ed, code: lastSeason.code, y: lastSeason.y, num: null, active: 1 }
  const socials = p.socials ? JSON.parse(p.socials) : {}
  let records: unknown = null
  try {
    records = p.career ? JSON.parse(p.career).records ?? null : null
  } catch {}
  // Títulos de club: estaba en el equipo campeón (o finalista) esa temporada.
  const titles: unknown[] = []
  const acbClubs = new Map<number, Set<string>>()
  for (const s of seasons) {
    if (s.code !== 'ACB') continue
    const club = s.t != null ? teams.get(s.t)!.club : s.club
    if (!club) continue
    if (!acbClubs.has(s.y)) acbClubs.set(s.y, new Set())
    acbClubs.get(s.y)!.add(club)
  }
  for (const h of honours as any[]) {
    const set = acbClubs.get(h.season_start_year)
    if (!set) continue
    for (const [won, cid] of [[1, h.champion_club_id], [0, h.runner_up_club_id]] as const) {
      const cr = cid ? clubRef.get(cid) : undefined
      if (cr && set.has(cr)) {
        const cl: any = clubById.get(cid)
        titles.push({ k: h.competition, y: h.season_start_year, label: h.label, won, club: cr, name: cl?.name, logo: cl?.logo_url ?? null, vs: won ? h.runner_up_name : h.champion_name, res: h.result })
      }
    }
  }
  for (const s of seasons) {
    const f = s.ed != null ? euroFinals.get(s.ed) : undefined
    if (!f || s.gp === 0 || (s.t !== f.win && s.t !== f.lose)) continue
    const t = teams.get(s.t)!
    const o = teams.get(s.t === f.win ? f.lose : f.win)!
    titles.push({ k: f.code.toLowerCase(), y: f.y, label: `${f.y}-${String(f.y + 1).slice(2)}`, won: s.t === f.win ? 1 : 0, club: t.club, name: t.name, logo: t.logo, vs: o.name, res: null })
  }
  for (const [y, re] of OLD_EL) {
    const cl: any = (clubs as any[]).find((c) => re.test(c.name) && acbClubs.get(y)?.has(clubRef.get(c.id)!))
    if (cl) titles.push({ k: 'euroleague', y, label: `${y}-${String(y + 1).slice(2)}`, won: 1, club: clubRef.get(cl.id), name: cl.name, logo: cl.logo_url, vs: null, res: null })
  }
  const medals = medalsOf.get(p.id) ?? []
  pBuckets[bucketOf(ref, BUCKETS.p)][ref] = {
    titles,
    medals,
    ref, name: displayName(p), first: p.first_name, last: p.last_name, full: p.full_name, birth: p.birth_date, place: p.birth_place, nat: p.nationality,
    h: p.height_cm, w: p.weight_kg, pos: p.position, posc: p.position_code, photo: p.photo_url, cut: p.photo_nobg_url, body: p.body_photo_url, socials,
    cur, seasons, log: logs, tm, stints: stints.get(p.id) ?? [], records
  }
  const ct = cur ? teams.get(cur.t) : undefined
  search.p.push([ref, displayName(p), ct?.short ?? ct?.name ?? null, cur?.code ?? null, cur?.y ?? null, ct?.logo ?? null])
}
pBuckets.forEach((b, i) => write(`p/${i}.json`, b))
log(`jugadores: ${players.length} en ${BUCKETS.p} cubos`)

// ───────────────────────── Clubes (cubos) ─────────────────────────
const rosterByTeam = new Map<number, any[]>()
for (const r of all(`SELECT * FROM roster_entries ORDER BY is_active DESC, CAST(jersey_number AS INTEGER)`)) {
  if (!rosterByTeam.has(r.team_id)) rosterByTeam.set(r.team_id, [])
  const p: any = pById.get(r.player_id)
  rosterByTeam.get(r.team_id)!.push([playerRef.get(r.player_id), r.jersey_number, r.position_code ?? p.position_code, r.is_active, r.license_type, ...plLite(r.player_id)])
}
const staffByTeam = new Map<number, any[]>()
for (const r of all(`SELECT ts.team_id, ts.role, COALESCE(c.full_name, TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,''))) AS name, c.photo_url FROM team_staff ts JOIN coaches c ON c.id = ts.coach_id`)) {
  if (!staffByTeam.has(r.team_id)) staffByTeam.set(r.team_id, [])
  staffByTeam.get(r.team_id)!.push([r.name, r.role, r.photo_url])
}
const cBuckets: Record<string, any>[] = Array.from({ length: BUCKETS.c }, () => ({}))
for (const c of clubs as any[]) {
  const ref = clubRef.get(c.id)!
  const cTeams = [...teams.values()].filter((t) => t.club === ref).map((t) => ({ t: t.id, ed: t.ed, y: edById.get(t.ed)!.y, code: edById.get(t.ed)!.code, name: t.name, logo: t.logo })).sort((a, b) => b.y - a.y)
  const rosters: Record<number, unknown> = {}
  const staff: Record<number, unknown> = {}
  for (const t of cTeams) {
    if (rosterByTeam.has(t.t)) rosters[t.t] = rosterByTeam.get(t.t)
    if (staffByTeam.has(t.t)) staff[t.t] = staffByTeam.get(t.t)
  }
  const filiales = clubs.filter((x: any) => x.parent_club_id === c.id).map((x: any) => [clubRef.get(x.id), x.name, x.logo_url])
  cBuckets[bucketOf(ref, BUCKETS.c)][ref] = {
    ref, name: c.name, short: c.short_name, abbr: c.abbreviation, city: c.city, country: c.country, founded: c.founded_year, arena: c.arena, arenaCap: c.arena_capacity, arenaPhoto: c.arena_photo_url,
    web: c.website, president: c.president, socials: c.socials ? JSON.parse(c.socials) : {}, history: c.history, logo: c.logo_url, c1: c.primary_color, c2: c.secondary_color,
    parent: c.parent_club_id ? [clubRef.get(c.parent_club_id), clubById.get(c.parent_club_id)?.name] : null, filiales,
    teams: cTeams, rosters, staff,
    honours: [
      ...honours.filter((h: any) => h.champion_club_id === c.id || h.runner_up_club_id === c.id).map((h: any) => [h.competition, h.season_start_year, h.label, h.champion_club_id === c.id ? 1 : 0, h.champion_club_id === c.id ? h.runner_up_name : h.champion_name, h.result]),
      // Finales de competiciones europeas y ligas con playoff cargadas (campeón o finalista).
      ...cTeams.flatMap((t) => {
        const f = euroFinals.get(t.ed)
        if (!f || (t.t !== f.win && t.t !== f.lose)) return []
        const won = t.t === f.win
        return [[f.code.toLowerCase(), f.y, `${f.y}-${String(f.y + 1).slice(2)}`, won ? 1 : 0, teams.get(won ? f.lose : f.win)?.name ?? null, null]]
      }),
      ...OLD_EL.filter(([, re]) => re.test(c.name) && cTeams.some((t) => t.code === 'ACB')).map(([y]) => ['euroleague', y, `${y}-${String(y + 1).slice(2)}`, 1, null, null])
    ].sort((a: any, b: any) => b[1] - a[1])
  }
  if (cTeams.length) search.c.push([ref, c.name, c.logo_url, cTeams[0].code, cTeams[0].y])
}
cBuckets.forEach((b, i) => write(`c/${i}.json`, b))
log(`clubes: ${clubs.length} en ${BUCKETS.c} cubos`)

// ───────────────────────── Boxscores (cubos) ─────────────────────────
const gBuckets: Record<string, any>[] = Array.from({ length: BUCKETS.g }, () => ({}))
for (const [gid, box] of gBox) {
  const g: any = gById.get(gid)
  const ref = gameRef.get(gid)!
  const names: Record<string, unknown> = {}
  const teamsOut: Record<number, unknown> = {}
  for (const [tid, lines] of box) {
    teamsOut[tid] = { coach: coaches.get(`${gid}:${tid}`) ?? null, lines }
    for (const l of lines) names[l[0]] ??= plLite(refToId.get(l[0])!).slice(0, 3)
  }
  let refs: string[] = []
  try {
    refs = g.referees ? JSON.parse(g.referees) : []
  } catch {}
  gBuckets[bucketOf(ref, BUCKETS.g)][ref] = { ed: g.competition_season_id, per: periods.get(gid) ?? [], att: g.attendance, ar: g.arena, refs, teams: teamsOut, names }
}
// Partidos sin boxscore: solo la edición, para que la página del partido encuentre su fila.
for (const g of games as any[]) {
  const ref = gameRef.get(g.id)!
  const b = gBuckets[bucketOf(ref, BUCKETS.g)]
  b[ref] ??= { ed: g.competition_season_id, per: periods.get(g.id) ?? [], att: g.attendance, ar: g.arena, refs: [], teams: {}, names: {} }
}
// Cara a cara: los 6 enfrentamientos anteriores entre los dos clubes, en cualquier competición.
{
  const pairs = new Map<string, any[]>()
  const fin = (games as any[]).filter((g) => g.status === 'finished' && g.home_score != null && g.scheduled_at).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const club = (tid: number) => teams.get(tid)?.club
  for (const g of fin) {
    const k = [club(g.home_team_id), club(g.away_team_id)].sort().join('|')
    ;(pairs.get(k) ?? pairs.set(k, []).get(k)!).push(g)
  }
  for (const g of games as any[]) {
    const ref = gameRef.get(g.id)!
    const rec = gBuckets[bucketOf(ref, BUCKETS.g)][ref]
    const list = pairs.get([club(g.home_team_id), club(g.away_team_id)].sort().join('|')) ?? []
    const prev = list.filter((x) => x.id !== g.id && (!g.scheduled_at || x.scheduled_at < g.scheduled_at)).slice(-6).reverse()
    if (prev.length) rec.h2h = prev.map((x) => [gameRef.get(x.id), x.scheduled_at, edById.get(x.competition_season_id)!.code, club(x.home_team_id), x.home_score, x.away_score])
  }
}
gBuckets.forEach((b, i) => write(`g/${i}.json`, b))
log(`boxscores: ${gBox.size} en ${BUCKETS.g} cubos`)

// ───────────────────────── Portada: partidos de ±10 días y mejores actuaciones ─────────────────────────
const now = Date.now()
const near = games.filter((g: any) => g.scheduled_at && Math.abs(Date.parse(g.scheduled_at) - now) < 10 * 86400_000)
const dTeams: Record<number, unknown> = {}
const dGames = near.map((g: any) => {
  dTeams[g.home_team_id] ??= teamLite(g.home_team_id)
  dTeams[g.away_team_id] ??= teamLite(g.away_team_id)
  const rd: any = rounds.get(g.round_id)
  return { id: gameRef.get(g.id), ed: g.competition_season_id, code: edById.get(g.competition_season_id)!.code, rn: rd?.name ?? (rd?.number ? `Jornada ${rd.number}` : null), d: g.scheduled_at, h: g.home_team_id, a: g.away_team_id, hs: g.home_score, as: g.away_score, st: g.status === 'finished' ? 'f' : g.status === 'postponed' ? 'p' : 's', box: gBox.has(g.id) ? 1 : 0 }
}).sort((a, b) => a.d.localeCompare(b.d))
const top: any[] = []
for (const g of near as any[]) {
  if (g.status !== 'finished' || now - Date.parse(g.scheduled_at) > 8 * 86400_000) continue
  for (const [tid, lines] of gBox.get(g.id) ?? []) for (const l of lines) {
    const pir = l[3 + 18] ?? null
    const val = pir ?? l[4] + l[13] + l[14] + l[15] + l[16] - (l[6] - l[5]) - (l[8] - l[7]) - (l[10] - l[9]) - l[17] - l[18]
    top.push({ p: l[0], g: gameRef.get(g.id), code: edById.get(g.competition_season_id)!.code, t: tid, opp: g.home_team_id === tid ? g.away_team_id : g.home_team_id, d: g.scheduled_at, won: (g.home_team_id === tid) === g.home_score > g.away_score, pts: l[4], reb: l[13], ast: l[14], val })
  }
}
top.sort((a, b) => b.val - a.val)
const best = top.slice(0, 12)
const bestPl: Record<string, unknown> = {}
for (const b of best) (bestPl[b.p] = plLite(refToId.get(b.p)!)), (dTeams[b.t] ??= teamLite(b.t)), (dTeams[b.opp] ??= teamLite(b.opp))
// Españoles fuera de las ligas españolas en los partidos de los últimos 3 días («anoche»).
const espLast: any[] = []
{
  const cc = new Map((all(`SELECT code, country FROM competitions`) as any[]).map((c) => [c.code, c.country]))
  for (const g of near as any[]) {
    if (g.status !== 'finished' || now - Date.parse(g.scheduled_at) > 3.5 * 86400_000) continue
    const code = edById.get(g.competition_season_id)!.code
    if (cc.get(code) === 'ES') continue
    for (const [tid, ls] of gBox.get(g.id) ?? []) for (const l of ls) {
      const p: any = pById.get(refToId.get(l[0])!)
      if (p?.nationality !== 'España' || !((l[3] ?? 0) > 0 || (l[4] ?? 0) > 0)) continue
      const home = g.home_team_id === tid
      espLast.push({ p: l[0], g: gameRef.get(g.id), code, t: tid, opp: home ? g.away_team_id : g.home_team_id, d: g.scheduled_at, won: home === g.home_score > g.away_score, sc: home ? `${g.home_score}-${g.away_score}` : `${g.away_score}-${g.home_score}`, min: Math.round((l[3] ?? 0) / 60), pts: l[4], reb: l[13], ast: l[14], val: l[21] })
      bestPl[l[0]] ??= plLite(p.id)
      dTeams[tid] ??= teamLite(tid)
      dTeams[home ? g.away_team_id : g.home_team_id] ??= teamLite(home ? g.away_team_id : g.home_team_id)
    }
  }
  espLast.sort((a, b) => b.d.localeCompare(a.d) || b.val - a.val)
}
write('days.json', { at: new Date(now).toISOString(), games: dGames, teams: dTeams, best, pl: bestPl, esp: espLast })
log(`portada: ${dGames.length} partidos cercanos, ${best.length} actuaciones destacadas`)

// ───────────────────────── Españoles por el mundo ─────────────────────────
// Esta temporada, fuera de las ligas españolas: ligas de otros países y competiciones europeas con clubes extranjeros.
const curY = Math.max(...eds.filter((e) => e.fin > 0).map((e) => e.y))
const compCountry = new Map((all(`SELECT code, country FROM competitions`) as any[]).map((c) => [c.code, c.country]))
const spanishClubs = new Set([...teams.values()].filter((t) => compCountry.get(edById.get(t.ed)!.code) === 'ES').map((t) => t.club))
const abroad = (ed: number, team: number) => {
  const cc = compCountry.get(edById.get(ed)!.code)
  return cc !== 'ES' && (cc !== 'EU' || !spanishClubs.has(teams.get(team)!.club))
}
const esp: any[] = []
const espTeams: Record<number, unknown> = {}
const espPl: Record<string, unknown> = {}
for (const p of players as any[]) {
  if (p.nationality !== 'España') continue
  const logs = (pLog.get(p.id) ?? []).filter((l) => edById.get(l[1])!.y === curY && compCountry.get(edById.get(l[1])!.code) !== 'ES')
  if (!logs.length) continue
  const byEd = new Map<string, any[]>()
  for (const l of logs) (byEd.get(`${l[1]}:${l[3]}`) ?? byEd.set(`${l[1]}:${l[3]}`, []).get(`${l[1]}:${l[3]}`)!).push(l)
  const ref = playerRef.get(p.id)!
  espPl[ref] = plLite(p.id)
  for (const ls of byEd.values()) {
    ls.sort((a, b) => (a[2] ?? '').localeCompare(b[2] ?? ''))
    const s = new Array(N).fill(0)
    let gp = 0
    let w = 0
    for (const l of ls) {
      if (l[9] > 0 || l[10] > 0) gp++
      if (l[6] > l[7]) w++
      for (let i = 0; i < N; i++) s[i] += l[9 + i] ?? 0
    }
    const last = ls.at(-1)
    espTeams[last[3]] ??= teamLite(last[3])
    espTeams[last[4]] ??= teamLite(last[4])
    esp.push({ p: ref, ed: last[1], code: edById.get(last[1])!.code, t: last[3], ab: abroad(last[1], last[3]) ? 1 : 0, gp, w, s, last })
  }
}
write('espanoles.json', { y: curY, rows: esp, teams: espTeams, pl: espPl })
log(`españoles por el mundo: ${new Set(esp.map((e) => e.p)).size} jugadores en ${esp.length} equipos`)

write('search.json', search)
log(`buscador: ${search.p.length} jugadores, ${search.c.length} clubes · fin`)
