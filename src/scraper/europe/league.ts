/**
 * Ligas nacionales europeas. Cada liga es un adaptador pequeño que traduce su fuente oficial al
 * modelo normalizado (equipos, partidos, plantillas, boxscores); este módulo los guarda igual
 * para todas, como hacen los scrapers de la ACB, la FEB o Euroleague.
 */
import type { DB } from '../../db/database'
import { Writer } from '../../db/writer'
import type { HttpClient } from '../core/http'
import type { AcbSyncOptions, SyncSummary } from '../acb/sync'
import { currentSeasonStart } from '../feb/sync'
import type { CompetitionCode, NBoxscore, NGame, NRosterEntry, NStatLine, NTeam, PositionCode, SourceName } from '../types'

export interface LeagueData {
  editionRef: string
  teams: NTeam[]
  games: NGame[]
}

export interface LeagueAdapter {
  source: SourceName
  competition: CompetitionCode
  name: string
  /** `known`: partidos ya terminados en la base de datos (id → marcador), para no volver a pedirlos. */
  load(startYear: number, known: Map<string, { home: number; away: number }>): Promise<LeagueData>
  roster?(team: NTeam, startYear: number): Promise<NRosterEntry[]>
  boxscore?(game: NGame, startYear: number): Promise<NBoxscore | undefined>
}

export const zeroLine = (): NStatLine => ({ seconds: 0, points: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, tov: 0, blk: 0, blkAgainst: 0, dunks: 0, pf: 0, foulsDrawn: 0 })
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
export const POS_NAME: Record<PositionCode, string> = { PG: 'Base', SG: 'Escolta', SF: 'Alero', PF: 'Ala-pívot', C: 'Pívot' }
/** Suma las líneas de los jugadores (para equipos cuya fuente no publica totales). */
export function sumLines(ls: NStatLine[]): NStatLine {
  const t = zeroLine()
  for (const l of ls) for (const k of Object.keys(t) as (keyof NStatLine)[]) (t as any)[k] += (l as any)[k] ?? 0
  return t
}

export async function syncLeague(db: DB, http: HttpClient, a: LeagueAdapter, opts: AcbSyncOptions & { season?: number } = {}): Promise<SyncSummary> {
  const w = new Writer(db)
  const log = opts.log ?? (() => {})
  const startYear = opts.season ?? currentSeasonStart()
  const label = `${a.name} ${startYear}-${String(startYear + 1).slice(-2)}`
  const runId = w.startRun(a.source, `${a.competition}:${startYear}`)
  const summary: SyncSummary = { edition: label, competitionSeasonId: 0, teams: 0, games: 0, rosters: 0, players: 0, playerBios: 0, boxscores: 0, careerSeasons: 0, history: false, requests: 0, errors: [] }

  log(`▶ ${label}: equipos y calendario`)
  const known = new Map(
    (
      db
        .prepare(
          `SELECT x.external_id AS id, g.home_score AS home, g.away_score AS away FROM games g
           JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = ?
           JOIN competition_seasons cs ON cs.id = g.competition_season_id JOIN seasons s ON s.id = cs.season_id
           WHERE s.start_year = ? AND g.status = 'finished' AND g.boxscore_synced_at IS NOT NULL`
        )
        .all(a.source, startYear) as { id: string; home: number; away: number }[]
    ).map((r) => [r.id, { home: r.home, away: r.away }])
  )
  const data = await a.load(startYear, known)
  const csId = w.transaction(() => {
    const csId = w.upsertEdition({ ref: { source: a.source, id: data.editionRef }, competition: a.competition, startYear, name: label, isCurrent: startYear === currentSeasonStart() })
    const ids = new Map<string, number>()
    for (const t of data.teams) ids.set(t.ref.id, w.upsertTeam(csId, t))
    for (const g of data.games) {
      const home = ids.get(g.homeTeam.ref.id) ?? w.upsertTeam(csId, g.homeTeam)
      const away = ids.get(g.awayTeam.ref.id) ?? w.upsertTeam(csId, g.awayTeam)
      w.upsertGame(csId, g, home, away)
    }
    w.refreshRoundDates(csId)
    return csId
  })
  summary.competitionSeasonId = csId
  summary.teams = data.teams.length
  summary.games = data.games.length
  log(`  ${data.teams.length} equipos, ${data.games.length} partidos (${data.games.filter((g) => g.status === 'finished').length} jugados)`)

  if (opts.rosters !== false && a.roster) {
    log('▶ Plantillas')
    for (const t of data.teams) {
      try {
        const entries = await a.roster(t, startYear)
        const teamId = w.findId('team', t.ref)
        if (teamId == null) continue
        w.transaction(() => {
          for (const e of entries) {
            const playerId = w.upsertPlayer(e.player, { bio: true, fillOnly: true })
            const { player: _p, ...rest } = e
            w.upsertRosterEntry(teamId, playerId, rest)
          }
        })
        summary.rosters++
      } catch (err) {
        summary.errors.push({ url: `plantilla ${t.name}`, error: String(err) })
      }
    }
  }

  if (opts.boxscores !== false && a.boxscore) {
    const done = new Set(
      (
        db
          .prepare(
            `SELECT x.external_id AS id FROM games g JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = ?
             WHERE g.competition_season_id = ? AND g.boxscore_synced_at IS NOT NULL`
          )
          .all(a.source, csId) as { id: string }[]
      ).map((r) => r.id)
    )
    const pending = data.games.filter((g) => g.status === 'finished' && (opts.force || !done.has(g.ref.id)))
    log(`▶ Boxscores (${pending.length} pendientes)`)
    for (const g of pending.slice(0, opts.maxBoxscores ?? pending.length)) {
      try {
        const box = await a.boxscore(g, startYear)
        if (!box) continue
        w.saveBoxscore(csId, box, { round: g.round })
        summary.boxscores++
      } catch (err) {
        summary.errors.push({ url: `partido ${g.ref.id}`, error: String(err) })
      }
    }
  }

  summary.players = (db.prepare('SELECT COUNT(DISTINCT r.player_id) AS n FROM roster_entries r JOIN teams t ON t.id = r.team_id WHERE t.competition_season_id = ?').get(csId) as { n: number }).n
  w.touchEdition(csId)
  summary.requests = http.requests
  w.finishRun(runId, { csId, status: summary.errors.length ? 'partial' : 'ok', requests: summary.requests, summary: { ...summary, errors: undefined }, errors: summary.errors })
  return summary
}
