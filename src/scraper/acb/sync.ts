/**
 * Orquestador del scraper de la ACB: descarga → parsea → guarda en SQLite.
 *
 *  syncCurrent()        Temporada en curso: calendario completo, plantillas,
 *                       fichas de jugador y boxscores de los partidos jugados.
 *  syncHistoric(año)    Temporadas pasadas (experimental): usa las páginas de
 *                       partidos por equipo, que sí respetan ?editionId=N.
 *
 * Es incremental: los boxscores ya descargados y las fichas de jugador
 * recientes se saltan salvo que se fuerce.
 */
import type { DB } from '../../db/database'
import { Writer } from '../../db/writer'
import { HttpClient, HttpError } from '../core/http'
import type { NEdition, NRound, NTeam } from '../types'
import {
  ParseError,
  parseBoxscore,
  parseCalendar,
  parseEditions,
  parsePlayerProfile,
  parseRoster,
  parseTeamSchedule
} from './parsers'
import { RscDocument } from '../core/rsc'
import { acbUrls, slugFromTeamUrl } from './urls'

export interface SyncProgress {
  stage: 'calendar' | 'rosters' | 'players' | 'boxscores' | 'schedules' | 'done'
  done: number
  total: number
  message?: string
}

export interface AcbSyncOptions {
  rosters?: boolean
  players?: boolean
  boxscores?: boolean
  /** Re-descarga boxscores aunque ya estén guardados. */
  force?: boolean
  /** Días tras los que se vuelve a leer la ficha de un jugador. */
  playerMaxAgeDays?: number
  /** Máximo de boxscores a descargar en esta ejecución (útil para pruebas). */
  maxBoxscores?: number
  log?: (msg: string) => void
  onProgress?: (p: SyncProgress) => void
}

export interface SyncSummary {
  edition: string
  competitionSeasonId: number
  teams: number
  games: number
  rosters: number
  players: number
  playerBios: number
  boxscores: number
  requests: number
  errors: { url?: string; error: string }[]
}

export class AcbScraper {
  private readonly w: Writer

  constructor(
    private readonly db: DB,
    private readonly http: HttpClient
  ) {
    this.w = new Writer(db)
  }

  // ───────────────────────── Temporada actual ─────────────────────────
  async syncCurrent(opts: AcbSyncOptions = {}): Promise<SyncSummary> {
    const log = opts.log ?? (() => {})
    const runId = this.w.startRun('acb', this.scope(opts))
    const summary = this.emptySummary()
    try {
      log('▶ Calendario de la temporada en curso')
      opts.onProgress?.({ stage: 'calendar', done: 0, total: 1 })
      const res = await this.http.get(acbUrls.calendar())
      const cal = parseCalendar(res.body)
      summary.edition = cal.edition.name ?? cal.edition.ref.id

      const csId = this.w.transaction(() => {
        const csId = this.w.upsertEdition(cal.edition)
        const teamIds = new Map<string, number>()
        for (const t of cal.teams) teamIds.set(t.ref.id, this.w.upsertTeam(csId, t, { updateClubName: true }))
        for (const g of cal.games) {
          this.w.upsertGame(csId, g, teamIds.get(g.homeTeam.ref.id)!, teamIds.get(g.awayTeam.ref.id)!)
        }
        this.w.refreshRoundDates(csId)
        return csId
      })
      summary.competitionSeasonId = csId
      summary.teams = cal.teams.length
      summary.games = cal.games.length
      const played = cal.games.filter((g) => g.status === 'finished').length
      log(`  ${cal.edition.name}: ${cal.teams.length} equipos, ${cal.games.length} partidos (${played} jugados)`)

      await this.syncEditionDetails(csId, cal.edition, cal.teams, opts, summary)
      this.finish(runId, csId, summary)
      return summary
    } catch (err) {
      this.fail(runId, summary, err)
      throw err
    }
  }

  // ───────────────────────── Histórico ─────────────────────────
  async syncHistoric(startYear: number, opts: AcbSyncOptions = {}): Promise<SyncSummary> {
    const log = opts.log ?? (() => {})
    const runId = this.w.startRun('acb', `historic:${startYear},${this.scope(opts)}`)
    const summary = this.emptySummary()
    try {
      const edition = await this.findEdition(startYear)
      if (!edition) throw new Error(`La ACB no publica la temporada ${startYear}-${startYear + 1}`)
      summary.edition = edition.name ?? edition.ref.id
      const csId = this.w.upsertEdition({ ...edition, isCurrent: false })
      summary.competitionSeasonId = csId
      log(`▶ ${edition.name} (editionId ${edition.ref.id})`)

      // Cola de clubes: los conocidos en la BD + los que aparezcan en los boxscores.
      const clubQueue = this.knownAcbClubIds()
      const visitedClubs = new Set<string>()
      const scheduled = new Map<string, NRound | undefined>()
      const savedGames = new Set<string>()
      const teams = new Map<string, NTeam>()
      let boxscoreBudget = opts.maxBoxscores ?? Infinity

      while (clubQueue.length) {
        const clubId = clubQueue.shift()!
        if (visitedClubs.has(clubId)) continue
        visitedClubs.add(clubId)
        const slug = await this.resolveClubSlug(clubId)
        if (!slug) continue

        opts.onProgress?.({ stage: 'schedules', done: visitedClubs.size, total: visitedClubs.size + clubQueue.length })
        let rows
        try {
          rows = parseTeamSchedule((await this.http.get(acbUrls.teamGames(slug, edition.ref.id))).body)
        } catch (err) {
          summary.errors.push({ url: acbUrls.teamGames(slug, edition.ref.id), error: String(err) })
          continue
        }
        if (rows.length === 0) continue // el club no jugó esa temporada
        log(`  ${slug}: ${rows.length} partidos`)
        for (const r of rows) if (!scheduled.has(r.gameRef.id)) scheduled.set(r.gameRef.id, r.round)

        // Descargar boxscores nuevos: revelan los equipos (y clubes) de esa edición.
        for (const [gameId, round] of scheduled) {
          if (savedGames.has(gameId) || boxscoreBudget <= 0) continue
          if (!opts.force && this.hasBoxscore(gameId)) {
            savedGames.add(gameId)
            continue
          }
          const box = await this.fetchBoxscore(gameId, summary)
          savedGames.add(gameId)
          if (!box) continue
          boxscoreBudget--
          this.w.saveBoxscore(csId, box, { round })
          summary.boxscores++
          for (const t of [box.homeTeam, box.awayTeam]) {
            teams.set(t.ref.id, t)
            if (!visitedClubs.has(t.clubRef.id) && !clubQueue.includes(t.clubRef.id)) clubQueue.push(t.clubRef.id)
          }
          opts.onProgress?.({ stage: 'boxscores', done: savedGames.size, total: scheduled.size })
        }
      }
      this.w.refreshRoundDates(csId)
      summary.games = scheduled.size

      // Equipos de la edición con su slug para poder bajar plantillas.
      const editionTeams = this.teamsOfEdition(csId)
      summary.teams = editionTeams.length
      await this.syncEditionDetails(csId, edition, editionTeams, { ...opts, boxscores: false }, summary)
      this.finish(runId, csId, summary)
      return summary
    } catch (err) {
      this.fail(runId, summary, err)
      throw err
    }
  }

  /** Temporadas disponibles en acb.com (lee el selector de una ficha de equipo). */
  async listEditions(): Promise<NEdition[]> {
    const slug = this.anyKnownSlug() ?? (await this.resolveClubSlug('9')) // 9 = Real Madrid
    if (!slug) return []
    const res = await this.http.get(acbUrls.roster(slug))
    return parseEditions(RscDocument.fromHtml(res.body))
  }

  // ───────────────────────── Pasos comunes ─────────────────────────
  private async syncEditionDetails(
    csId: number,
    edition: NEdition,
    teams: NTeam[],
    opts: AcbSyncOptions,
    summary: SyncSummary
  ) {
    const log = opts.log ?? (() => {})

    if (opts.rosters !== false) {
      log('▶ Plantillas')
      let i = 0
      for (const team of teams) {
        opts.onProgress?.({ stage: 'rosters', done: i++, total: teams.length, message: team.name })
        const slug = team.slug ?? (await this.resolveClubSlug(team.clubRef.id))
        if (!slug) {
          summary.errors.push({ error: `Sin slug para ${team.name}` })
          continue
        }
        const url = acbUrls.roster(slug, edition.ref.id)
        try {
          const roster = parseRoster((await this.http.get(url)).body)
          this.w.transaction(() => {
            const teamId = this.w.upsertTeam(csId, { ...team, slug })
            const seen: number[] = []
            for (const e of roster.players) {
              const playerId = this.w.upsertPlayer(e.player)
              this.w.upsertRosterEntry(teamId, playerId, e)
              if (e.isActive) seen.push(playerId)
            }
            this.w.deactivateMissing(teamId, seen)
            this.w.setStaff(
              teamId,
              roster.staff.map((c) => ({ coachId: this.w.upsertCoach(c), role: c.role }))
            )
          })
          summary.rosters++
          log(`  ${team.name}: ${roster.players.filter((p) => p.isActive).length} jugadores, ${roster.staff.length} técnicos`)
        } catch (err) {
          summary.errors.push({ url, error: String(err) })
          log(`  ✗ ${team.name}: ${(err as Error).message}`)
        }
      }
    }

    if (opts.players !== false) {
      const maxAge = opts.playerMaxAgeDays ?? 30
      const pending = this.db
        .prepare(
          `SELECT DISTINCT p.id, x.external_id AS acb_id, p.full_name
           FROM players p
           JOIN roster_entries r ON r.player_id = p.id
           JOIN teams t ON t.id = r.team_id AND t.competition_season_id = ?
           JOIN external_ids x ON x.entity_type = 'player' AND x.entity_id = p.id AND x.source = 'acb'
           WHERE p.bio_synced_at IS NULL OR p.bio_synced_at < datetime('now', ?)`
        )
        .all(csId, `-${maxAge} days`) as { id: number; acb_id: string; full_name: string }[]
      log(`▶ Fichas de jugador (${pending.length} pendientes)`)
      let i = 0
      for (const p of pending) {
        opts.onProgress?.({ stage: 'players', done: i++, total: pending.length, message: p.full_name })
        const url = acbUrls.player(p.acb_id, edition.ref.id)
        try {
          const profile = parsePlayerProfile((await this.http.get(url)).body)
          this.w.upsertPlayer(profile, { bio: true })
          summary.playerBios++
        } catch (err) {
          summary.errors.push({ url, error: String(err) })
        }
      }
    }

    if (opts.boxscores !== false) {
      const where = opts.force ? '' : 'AND g.boxscore_synced_at IS NULL'
      const pending = this.db
        .prepare(
          `SELECT x.external_id AS acb_id, rd.phase, rd.number, rd.name
           FROM games g
           JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'acb'
           LEFT JOIN rounds rd ON rd.id = g.round_id
           WHERE g.competition_season_id = ? AND g.status = 'finished' ${where}
           ORDER BY g.scheduled_at`
        )
        .all(csId) as { acb_id: string; phase: string | null; number: number | null; name: string | null }[]
      const todo = pending.slice(0, opts.maxBoxscores ?? pending.length)
      log(`▶ Boxscores (${todo.length} pendientes)`)
      let i = 0
      for (const g of todo) {
        opts.onProgress?.({ stage: 'boxscores', done: i++, total: todo.length })
        const box = await this.fetchBoxscore(g.acb_id, summary)
        if (!box) continue
        const round = g.phase != null ? { phase: g.phase, number: g.number!, name: g.name ?? undefined } : undefined
        this.w.saveBoxscore(csId, box, { round })
        summary.boxscores++
      }
    }

    summary.players = (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT r.player_id) AS n FROM roster_entries r
           JOIN teams t ON t.id = r.team_id WHERE t.competition_season_id = ?`
        )
        .get(csId) as { n: number }
    ).n
    this.w.touchEdition(csId)
    opts.onProgress?.({ stage: 'done', done: 1, total: 1 })
  }

  private async fetchBoxscore(gameId: string, summary: SyncSummary) {
    const url = acbUrls.boxscore(gameId)
    try {
      return parseBoxscore((await this.http.get(url)).body, gameId)
    } catch (err) {
      summary.errors.push({ url, error: String(err) })
      return undefined
    }
  }

  // ───────────────────────── Utilidades ─────────────────────────
  private async findEdition(startYear: number): Promise<NEdition | undefined> {
    const known = this.db
      .prepare(
        `SELECT x.external_id AS id, cs.name FROM competition_seasons cs
         JOIN seasons s ON s.id = cs.season_id
         JOIN competitions c ON c.id = cs.competition_id AND c.code = 'ACB'
         JOIN external_ids x ON x.entity_type = 'competition_season' AND x.entity_id = cs.id AND x.source = 'acb'
         WHERE s.start_year = ?`
      )
      .get(startYear) as { id: string; name: string | null } | undefined
    if (known) {
      return {
        ref: { source: 'acb', id: known.id },
        competition: 'ACB',
        startYear,
        name: known.name ?? undefined
      }
    }
    return (await this.listEditions()).find((e) => e.startYear === startYear)
  }

  private async resolveClubSlug(clubId: string): Promise<string | undefined> {
    const row = this.db
      .prepare(
        `SELECT t.source_slug FROM teams t
         JOIN external_ids x ON x.entity_type = 'club' AND x.entity_id = t.club_id AND x.source = 'acb'
         WHERE x.external_id = ? AND t.source_slug IS NOT NULL
         ORDER BY t.competition_season_id DESC LIMIT 1`
      )
      .get(clubId) as { source_slug: string } | undefined
    if (row) return row.source_slug
    try {
      // Con un slug inventado, la web redirige a la URL canónica del club.
      const res = await this.http.get(acbUrls.teamBySlugless(clubId))
      return slugFromTeamUrl(res.finalUrl)
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return undefined
      throw err
    }
  }

  private knownAcbClubIds(): string[] {
    return (
      this.db
        .prepare(`SELECT external_id FROM external_ids WHERE entity_type = 'club' AND source = 'acb' ORDER BY entity_id`)
        .all() as { external_id: string }[]
    ).map((r) => r.external_id)
  }

  private anyKnownSlug(): string | undefined {
    return (
      this.db.prepare('SELECT source_slug FROM teams WHERE source_slug IS NOT NULL LIMIT 1').get() as
        | { source_slug: string }
        | undefined
    )?.source_slug
  }

  private hasBoxscore(acbGameId: string): boolean {
    return !!this.db
      .prepare(
        `SELECT 1 FROM games g JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'acb'
         WHERE x.external_id = ? AND g.boxscore_synced_at IS NOT NULL`
      )
      .get(acbGameId)
  }

  private teamsOfEdition(csId: number): NTeam[] {
    const rows = this.db
      .prepare(
        `SELECT t.name, t.short_name, t.abbreviation, t.source_slug, tx.external_id AS team_ext, cx.external_id AS club_ext
         FROM teams t
         JOIN external_ids tx ON tx.entity_type = 'team' AND tx.entity_id = t.id AND tx.source = 'acb'
         JOIN external_ids cx ON cx.entity_type = 'club' AND cx.entity_id = t.club_id AND cx.source = 'acb'
         WHERE t.competition_season_id = ?`
      )
      .all(csId) as {
      name: string
      short_name: string | null
      abbreviation: string | null
      source_slug: string | null
      team_ext: string
      club_ext: string
    }[]
    return rows.map((r) => ({
      ref: { source: 'acb', id: r.team_ext },
      clubRef: { source: 'acb', id: r.club_ext },
      name: r.name,
      shortName: r.short_name ?? undefined,
      abbreviation: r.abbreviation ?? undefined,
      slug: r.source_slug ?? undefined
    }))
  }

  private scope(opts: AcbSyncOptions): string {
    return [
      'calendar',
      opts.rosters !== false && 'rosters',
      opts.players !== false && 'players',
      opts.boxscores !== false && 'boxscores'
    ]
      .filter(Boolean)
      .join(',')
  }

  private emptySummary(): SyncSummary {
    return {
      edition: '',
      competitionSeasonId: 0,
      teams: 0,
      games: 0,
      rosters: 0,
      players: 0,
      playerBios: 0,
      boxscores: 0,
      requests: 0,
      errors: []
    }
  }

  private finish(runId: number, csId: number, summary: SyncSummary) {
    summary.requests = this.http.requests
    this.w.finishRun(runId, {
      csId,
      status: summary.errors.length ? 'partial' : 'ok',
      requests: summary.requests,
      summary: { ...summary, errors: undefined },
      errors: summary.errors
    })
  }

  private fail(runId: number, summary: SyncSummary, err: unknown) {
    summary.requests = this.http.requests
    const message = err instanceof ParseError || err instanceof Error ? err.message : String(err)
    this.w.finishRun(runId, {
      csId: summary.competitionSeasonId || undefined,
      status: 'error',
      requests: summary.requests,
      summary: { ...summary, errors: undefined },
      errors: [...summary.errors, { error: message }]
    })
  }
}
