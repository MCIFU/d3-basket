/**
 * Orquestador del scraper de la FEB (Primera FEB, Segunda FEB...):
 * calendario → plantillas y datos de club → fichas y trayectorias → boxscores.
 * Incremental como el de la ACB: los boxscores guardados y las fichas recientes se saltan.
 */
import type { DB } from '../../db/database'
import { Writer } from '../../db/writer'
import type { HttpClient } from '../core/http'
import type { NCalendar } from '../types'
import type { AcbSyncOptions, SyncSummary } from '../acb/sync'
import { parseFebBoxscore, parseFebCalendar, parseFebGroups, parseFebPlayer, parseFebTeam } from './parsers'
import { FEB_COMPETITIONS, febUrls, type FebCompetition } from './urls'

/** Temporada en curso: desde agosto se considera la nueva. */
export const currentSeasonStart = (d = new Date()) => (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1)

export class FebScraper {
  private readonly w: Writer

  constructor(
    private readonly db: DB,
    private readonly http: HttpClient
  ) {
    this.w = new Writer(db)
  }

  async sync(competition: FebCompetition, opts: AcbSyncOptions & { season?: number } = {}): Promise<SyncSummary> {
    const log = opts.log ?? (() => {})
    const { g, name } = FEB_COMPETITIONS[competition]
    const startYear = opts.season ?? currentSeasonStart()
    const label = `${name} ${startYear}-${String(startYear + 1).slice(-2)}`
    const runId = this.w.startRun('feb', `${competition}:${startYear}`)
    const summary: SyncSummary = {
      edition: label,
      competitionSeasonId: 0,
      teams: 0,
      games: 0,
      rosters: 0,
      players: 0,
      playerBios: 0,
      boxscores: 0,
      careerSeasons: 0,
      history: false,
      requests: 0,
      errors: []
    }
    try {
      log(`▶ ${label}: calendario`)
      opts.onProgress?.({ stage: 'calendar', done: 0, total: 1 })
      const cal = await this.calendar(g, competition, startYear, label)
      cal.edition.isCurrent = startYear === currentSeasonStart()
      const csId = this.w.transaction(() => {
        const csId = this.w.upsertEdition(cal.edition)
        const ids = new Map(cal.teams.map((t) => [t.ref.id, this.w.upsertTeam(csId, t, { updateClubName: true })]))
        for (const game of cal.games) this.w.upsertGame(csId, game, ids.get(game.homeTeam.ref.id)!, ids.get(game.awayTeam.ref.id)!)
        this.w.refreshRoundDates(csId)
        return csId
      })
      summary.competitionSeasonId = csId
      summary.teams = cal.teams.length
      summary.games = cal.games.length
      log(`  ${cal.teams.length} equipos, ${cal.games.length} partidos (${cal.games.filter((x) => x.status === 'finished').length} jugados)`)

      if (opts.rosters !== false) {
        log('▶ Plantillas y datos de club')
        for (const [i, team] of cal.teams.entries()) {
          opts.onProgress?.({ stage: 'rosters', done: i, total: cal.teams.length, message: team.name })
          const url = febUrls.team(team.ref.id)
          try {
            const roster = parseFebTeam((await this.http.get(url)).body, team.ref.id)
            this.w.transaction(() => {
              const teamId = this.w.upsertTeam(csId, team)
              const seen: number[] = []
              for (const e of roster.players) {
                const playerId = this.w.upsertPlayer(e.player)
                this.w.upsertRosterEntry(teamId, playerId, e)
                seen.push(playerId)
              }
              this.w.deactivateMissing(teamId, seen)
              this.w.updateClubInfo(roster.club)
              this.w.setStaff(teamId, roster.staff.map((c) => ({ coachId: this.w.upsertCoach(c), role: c.role })))
            })
            summary.rosters++
          } catch (err) {
            summary.errors.push({ url, error: String(err) })
          }
        }
      }

      if (opts.players !== false) {
        const maxAge = opts.playerMaxAgeDays ?? 30
        const pending = this.db
          .prepare(
            `SELECT DISTINCT p.id, px.external_id AS person, tx.external_id AS team
             FROM players p
             JOIN roster_entries r ON r.player_id = p.id AND r.is_active = 1
             JOIN teams t ON t.id = r.team_id AND t.competition_season_id = ?
             JOIN external_ids px ON px.entity_type = 'player' AND px.entity_id = p.id AND px.source = 'feb'
             JOIN external_ids tx ON tx.entity_type = 'team' AND tx.entity_id = t.id AND tx.source = 'feb'
             WHERE NOT EXISTS (SELECT 1 FROM player_stints s WHERE s.player_id = p.id AND s.source = 'feb')
                OR p.bio_synced_at IS NULL OR p.bio_synced_at < datetime('now', ?)
             ORDER BY p.bio_synced_at IS NOT NULL, p.bio_synced_at`
          )
          .all(csId, `-${maxAge} days`)
          .slice(0, opts.maxPlayerBios ?? Infinity) as { id: number; person: string; team: string }[]
        log(`▶ Fichas y trayectorias (${pending.length} pendientes)`)
        for (const [i, p] of pending.entries()) {
          opts.onProgress?.({ stage: 'players', done: i, total: pending.length })
          const url = febUrls.player(p.team, p.person)
          try {
            const { player, stints } = parseFebPlayer((await this.http.get(url)).body, p.person)
            const id = this.w.upsertPlayer(player, { bio: true })
            this.w.savePlayerStints(id, 'feb', stints)
            summary.playerBios++
          } catch (err) {
            summary.errors.push({ url, error: String(err) })
          }
        }
      }

      if (opts.boxscores !== false) {
        const pending = this.db
          .prepare(
            `SELECT x.external_id AS feb_id, rd.phase, rd.number, rd.name
             FROM games g
             JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'feb'
             LEFT JOIN rounds rd ON rd.id = g.round_id
             WHERE g.competition_season_id = ? AND g.status = 'finished' ${opts.force ? '' : 'AND g.boxscore_synced_at IS NULL'}
             ORDER BY g.scheduled_at`
          )
          .all(csId) as { feb_id: string; phase: string | null; number: number | null; name: string | null }[]
        const todo = pending.slice(0, opts.maxBoxscores ?? pending.length)
        log(`▶ Boxscores (${todo.length} pendientes)`)
        for (const [i, g2] of todo.entries()) {
          opts.onProgress?.({ stage: 'boxscores', done: i, total: todo.length })
          const url = febUrls.game(g2.feb_id)
          try {
            const box = parseFebBoxscore((await this.http.get(url)).body, g2.feb_id)
            const round = g2.phase != null ? { phase: g2.phase, number: g2.number!, name: g2.name ?? undefined } : undefined
            this.w.saveBoxscore(csId, box, { round })
            summary.boxscores++
          } catch (err) {
            summary.errors.push({ url, error: String(err) })
          }
        }
      }

      summary.players = (
        this.db
          .prepare(
            `SELECT COUNT(DISTINCT r.player_id) AS n FROM roster_entries r JOIN teams t ON t.id = r.team_id WHERE t.competition_season_id = ?`
          )
          .get(csId) as { n: number }
      ).n
      this.w.touchEdition(csId)
      summary.requests = this.http.requests
      this.w.finishRun(runId, {
        csId,
        status: summary.errors.length ? 'partial' : 'ok',
        requests: summary.requests,
        summary: { ...summary, errors: undefined },
        errors: summary.errors
      })
      opts.onProgress?.({ stage: 'done', done: 1, total: 1 })
      return summary
    } catch (err) {
      summary.requests = this.http.requests
      this.w.finishRun(runId, {
        csId: summary.competitionSeasonId || undefined,
        status: 'error',
        requests: summary.requests,
        summary: { ...summary, errors: undefined },
        errors: [...summary.errors, { error: err instanceof Error ? err.message : String(err) }]
      })
      throw err
    }
  }

  /**
   * Calendario completo. Si la liga se divide en grupos (Segunda FEB: A y B), la web
   * muestra uno por defecto y el resto se pide por postback; se unen todos y cada
   * equipo queda marcado con su grupo.
   */
  private async calendar(g: number, competition: FebCompetition, startYear: number, label: string): Promise<NCalendar> {
    const first = await this.http.get(febUrls.calendar(g, startYear))
    const info = parseFebGroups(first.body)
    if (info.groups.length <= 1) return parseFebCalendar(first.body, competition, startYear, label)
    const parts: NCalendar[] = []
    for (const group of info.groups) {
      const html = group.value === info.selected ? first.body : (await this.http.post(first.finalUrl, info.postback(group.value))).body
      parts.push(parseFebCalendar(html, competition, startYear, label, group.name))
    }
    return { ...parts[0], teams: parts.flatMap((c) => c.teams), games: parts.flatMap((c) => c.games) }
  }
}
