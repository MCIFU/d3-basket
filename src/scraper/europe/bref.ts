/**
 * Estadística por jugador de la Basketbol Süper Ligi turca y de los torneos de selecciones (Mundial y
 * Juegos Olímpicos) desde Basketball-Reference (sección
 * internacional): totales de cada jugador por equipo y temporada (tabla «player-stats-totals-TUR» de la
 * página de cada equipo). No hay boxscore por partido (las páginas de partidos están vetadas en su
 * robots.txt), así que se guardan como líneas de trayectoria por temporada (player_season_lines), igual
 * que las temporadas antiguas de acb.com. Respeta su Crawl-delay de 3 s (usar --delay 3500).
 */
import { country } from '../../../site/src/lib/countries'
import type { DB } from '../../db/database'
import type { HttpClient } from '../core/http'

const BASE = 'https://www.basketball-reference.com'
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const STOP = new Set(['sk', 'bk', 'jk', 's', 'k', 'j', 'basketbol', 'basketball', 'basket', 'spor', 'kulubu', 'belediyesi', 'belediye', 'bb', 'the'])
const tokens = (s: string) => norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t))
const decode = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").trim()

/** Filas de una tabla de Basketball-Reference como objetos data-stat → texto. */
function table(html: string, id: string): Record<string, string>[] {
  const i = html.indexOf(`id="${id}"`)
  if (i < 0) return []
  const t = html.slice(i, html.indexOf('</table>', i))
  const body = t.slice(t.indexOf('<tbody'))
  const rows: Record<string, string>[] = []
  for (const m of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const r: Record<string, string> = {}
    for (const c of m[1].matchAll(/<t[dh][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g)) r[c[1]] = decode(c[2])
    if (r.player) rows.push(r)
  }
  return rows
}

export interface BrefSummary {
  teams: number
  lines: number
  matched: number
  created: number
  noClub: string[]
}

/** Liga turca: totales de los jugadores de cada equipo (Basketball-Reference) en la temporada startYear. */
export const syncBslStats = (db: DB, http: HttpClient, startYear: number, log: (m: string) => void = () => {}) =>
  syncBrefTotals(db, http, { code: 'BSL', startYear, page: `/international/turkey-super-league/${startYear + 1}.html`, standings: 'tur_standings', table: 'TUR', key: 'bsl' }, log)

/** Torneos de selecciones: Mundial (desde 2010) y Juegos Olímpicos. year = año del torneo. */
export const BREF_TOURNAMENTS: Record<string, { page: (y: number) => string; table: string }> = {
  MUNDIAL: { page: (y) => `/international/fiba-world-cup/${y}.html`, table: 'FIB' },
  // Tokio 2020 se jugó en 2021: FIBA lo fecha en 2021 y Basketball-Reference en 2020.
  JJOO: { page: (y) => `/international/mens-olympics/${y === 2021 ? 2020 : y}.html`, table: 'OLY' }
}
export const syncBrefTournament = (db: DB, http: HttpClient, code: 'MUNDIAL' | 'JJOO', year: number, log: (m: string) => void = () => {}) =>
  syncBrefTotals(db, http, { code, startYear: year, page: BREF_TOURNAMENTS[code].page(year), table: BREF_TOURNAMENTS[code].table, key: 'nt', byCountry: true }, log)

interface BrefOpts {
  /** Competición en la base (player_season_lines.competition_code) y temporada (año de inicio o del torneo). */
  code: string
  startYear: number
  /** Página de la temporada o del torneo, con los enlaces a cada equipo. */
  page: string
  /** id de la tabla de clasificación de la que tomar los equipos (si no, toda la página). */
  standings?: string
  /** Sufijo de la tabla de totales en la página de equipo (player-stats-totals-XXX). */
  table: string
  /** Prefijo de la clave de los jugadores creados (bsl:nombre, nt:nombre). */
  key: string
  /** Emparejar equipos por país (selecciones) en vez de por nombre de club. */
  byCountry?: boolean
}

export async function syncBrefTotals(db: DB, http: HttpClient, o: BrefOpts, log: (m: string) => void = () => {}): Promise<BrefSummary> {
  const sum: BrefSummary = { teams: 0, lines: 0, matched: 0, created: 0, noClub: [] }
  const startYear = o.startYear
  const season = (await http.get(`${BASE}${o.page}`)).body
  const st = o.standings ? season.indexOf(`id="${o.standings}"`) : -1
  const teamLinks = [...new Map([...season.slice(st > 0 ? st : 0).matchAll(/href='(\/international\/teams\/([a-z0-9-]+)\/\d+\.html)'>(?:<strong>)?([^<]+)/g)].map((m) => [m[2], { url: m[1], slug: m[2], name: decode(m[3]) }])).values()]
  if (!teamLinks.length) throw new Error(`Basketball-Reference no tiene ${o.code} ${startYear}`)

  const ourTeams = db
    .prepare(
      `SELECT t.club_id, t.name, c.name club FROM teams t JOIN clubs c ON c.id = t.club_id
       JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN competitions co ON co.id = cs.competition_id
       JOIN seasons s ON s.id = cs.season_id WHERE co.code = ? AND s.start_year = ?`
    )
    .all(o.code, startYear) as { club_id: number; name: string; club: string }[]
  const clubFor = (name: string) => {
    if (o.byCountry) {
      const cc = country(name)?.cc
      return ourTeams.find((t) => cc && country(t.name)?.cc === cc)?.club_id ?? null
    }
    const tk = tokens(name)
    let best: { id: number; score: number } | undefined
    for (const t of ourTeams) {
      const other = new Set([...tokens(t.name), ...tokens(t.club)])
      const score = tk.filter((x) => other.has(x)).length
      if (score > 0 && (!best || score > best.score)) best = { id: t.club_id, score }
    }
    return best?.id ?? null
  }
  const byName = new Map<string, number[]>()
  for (const p of db.prepare('SELECT id, full_name, first_name, last_name, known_as FROM players').all() as any[]) {
    for (const n of new Set([p.full_name, p.known_as, p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null].filter(Boolean).map(norm))) {
      ;(byName.get(n) ?? byName.set(n, []).get(n)!).push(p.id)
    }
  }
  // Jugadores con partidos o plantilla en ese club (cualquier temporada cercana): desempata homónimos.
  const near = db.prepare(
    `SELECT DISTINCT r.player_id FROM roster_entries r JOIN teams t ON t.id = r.team_id JOIN competition_seasons cs ON cs.id = t.competition_season_id
     JOIN seasons s ON s.id = cs.season_id WHERE r.player_id = ? AND s.start_year BETWEEN ? AND ?
     UNION SELECT DISTINCT pg.player_id FROM player_game_stats pg JOIN games g ON g.id = pg.game_id JOIN competition_seasons cs ON cs.id = g.competition_season_id
     JOIN seasons s ON s.id = cs.season_id WHERE pg.player_id = ? AND s.start_year BETWEEN ? AND ?`
  )
  const extId = db.prepare(`SELECT entity_id FROM external_ids WHERE entity_type = 'player' AND source = 'bref' AND external_id = ?`)
  const newPlayer = db.prepare('INSERT INTO players (full_name, first_name, last_name) VALUES (?, ?, ?)')
  const newExt = db.prepare(`INSERT OR IGNORE INTO external_ids (entity_type, entity_id, source, external_id) VALUES ('player', ?, 'bref', ?)`)
  const del = db.prepare(`DELETE FROM player_season_lines WHERE competition_code = ? AND season_start_year = ? AND club_source_id = ?`)
  const ins = db.prepare(
    `INSERT OR REPLACE INTO player_season_lines (player_id, competition_code, season_start_year, club_source_id, club_id, team_name, games,
       seconds, points, fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, pf, pir)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const pick = (name: string): number => {
    const key = `${o.key}:${norm(name)}`
    const known = (extId.get(key) as { entity_id: number } | undefined)?.entity_id
    if (known) return known
    const ids = [...new Set(byName.get(norm(name)) ?? [])]
    const close = ids.filter((id) => near.get(id, startYear - 2, startYear + 2, id, startYear - 2, startYear + 2))
    const id = close.length === 1 ? close[0] : ids.length === 1 ? ids[0] : undefined
    if (id) {
      sum.matched++
      return id
    }
    const parts = name.split(' ')
    const created = Number(newPlayer.run(name, parts[0], parts.slice(1).join(' ') || null).lastInsertRowid)
    newExt.run(created, key)
    byName.set(norm(name), [created])
    sum.created++
    return created
  }

  // Emparejamiento de equipos: por nombre (o país) y, si queda uno sin pareja a cada lado, entre ellos
  // (TheSportsDB a veces conserva el nombre antiguo de un equipo que ha cambiado de club).
  const clubOf = new Map(teamLinks.map((t) => [t.slug, clubFor(t.name)]))
  const freeBr = teamLinks.filter((t) => clubOf.get(t.slug) == null)
  const freeOur = [...new Set(ourTeams.map((t) => t.club_id))].filter((id) => ![...clubOf.values()].includes(id))
  if (freeBr.length === 1 && freeOur.length === 1) clubOf.set(freeBr[0].slug, freeOur[0])
  for (const t of teamLinks) {
    const html = (await http.get(`${BASE}${t.url}`)).body
    const rows = table(html, `player-stats-totals-${o.table}`)
    const clubId = clubOf.get(t.slug) ?? null
    if (!clubId) sum.noClub.push(t.name)
    const n = (r: Record<string, string>, k: string) => Number(r[k]) || 0
    db.transaction(() => {
      del.run(o.code, startYear, t.slug)
      for (const r of rows) {
        if (!r.player || /team totals/i.test(r.player)) continue
        const pid = pick(r.player)
        const reb = n(r, 'trb')
        const pts = n(r, 'pts')
        const [f2m, f2a, f3m, f3a, ftm, fta] = [n(r, 'fg2'), n(r, 'fg2a'), n(r, 'fg3'), n(r, 'fg3a'), n(r, 'ft'), n(r, 'fta')]
        const pir = pts + reb + n(r, 'ast') + n(r, 'stl') + n(r, 'blk') - (f2a - f2m) - (f3a - f3m) - (fta - ftm) - n(r, 'tov') - n(r, 'pf')
        ins.run(pid, o.code, startYear, t.slug, clubId, t.name, n(r, 'g'), Math.round(n(r, 'mp') * 60), pts, f2m, f2a, f3m, f3a, ftm, fta, n(r, 'orb'), n(r, 'drb'), reb, n(r, 'ast'), n(r, 'stl'), n(r, 'tov'), n(r, 'blk'), n(r, 'pf'), pir)
        sum.lines++
      }
    }).immediate()
    sum.teams++
    log(`  ${t.name}: ${rows.length} jugadores${clubId ? '' : ' (sin club enlazado)'}`)
  }
  return sum
}
