/**
 * Escritura idempotente de datos normalizados en SQLite.
 * Toda entidad se localiza por su id externo (tabla external_ids), de modo que
 * volver a ejecutar el scraper actualiza en lugar de duplicar.
 */
import type { DB } from './database'
import type {
  NBoxscore,
  NCoach,
  NEdition,
  NGame,
  NPlayer,
  NRosterEntry,
  NRound,
  NStatLine,
  NTeam,
  SourceRef
} from '../scraper/types'

type EntityType = 'competition_season' | 'club' | 'team' | 'player' | 'coach' | 'game' | 'round'

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

export class Writer {
  constructor(private readonly db: DB) {}

  // ───────── external ids ─────────
  findId(type: EntityType, ref: SourceRef): number | undefined {
    const row = this.db
      .prepare('SELECT entity_id FROM external_ids WHERE entity_type = ? AND source = ? AND external_id = ?')
      .get(type, ref.source, ref.id) as { entity_id: number } | undefined
    return row?.entity_id
  }

  link(type: EntityType, entityId: number, ref: SourceRef) {
    this.db
      .prepare(
        `INSERT INTO external_ids (entity_type, entity_id, source, external_id, url) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (entity_type, source, external_id)
         DO UPDATE SET entity_id = excluded.entity_id, url = COALESCE(excluded.url, external_ids.url)`
      )
      .run(type, entityId, ref.source, ref.id, ref.url ?? null)
  }

  externalIdOf(type: EntityType, entityId: number, source: string): string | undefined {
    const row = this.db
      .prepare('SELECT external_id FROM external_ids WHERE entity_type = ? AND entity_id = ? AND source = ?')
      .get(type, entityId, source) as { external_id: string } | undefined
    return row?.external_id
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // ───────── temporadas / ediciones ─────────
  upsertEdition(e: NEdition): number {
    const comp = this.db.prepare('SELECT id FROM competitions WHERE code = ?').get(e.competition) as
      | { id: number }
      | undefined
    if (!comp) throw new Error(`Competición desconocida: ${e.competition}`)
    const label = `${e.startYear}-${String(e.startYear + 1).slice(-2)}`
    this.db
      .prepare('INSERT INTO seasons (start_year, end_year, label) VALUES (?, ?, ?) ON CONFLICT (start_year) DO NOTHING')
      .run(e.startYear, e.startYear + 1, label)
    const season = this.db.prepare('SELECT id FROM seasons WHERE start_year = ?').get(e.startYear) as { id: number }

    this.db
      .prepare(
        `INSERT INTO competition_seasons (competition_id, season_id, name, is_current) VALUES (?, ?, ?, ?)
         ON CONFLICT (competition_id, season_id)
         DO UPDATE SET name = COALESCE(excluded.name, name), is_current = MAX(is_current, excluded.is_current)`
      )
      .run(comp.id, season.id, e.name ?? null, e.isCurrent ? 1 : 0)
    const cs = this.db
      .prepare('SELECT id FROM competition_seasons WHERE competition_id = ? AND season_id = ?')
      .get(comp.id, season.id) as { id: number }
    if (e.isCurrent) {
      this.db
        .prepare('UPDATE competition_seasons SET is_current = (id = ?) WHERE competition_id = ?')
        .run(cs.id, comp.id)
    }
    this.link('competition_season', cs.id, e.ref)
    return cs.id
  }

  touchEdition(csId: number) {
    this.db.prepare('UPDATE competition_seasons SET last_synced_at = ? WHERE id = ?').run(nowIso(), csId)
  }

  // ───────── clubes / equipos ─────────
  upsertTeam(csId: number, t: NTeam, opts: { updateClubName?: boolean } = {}): number {
    let clubId = this.findId('club', t.clubRef)
    if (clubId == null) {
      clubId = Number(
        this.db
          .prepare('INSERT INTO clubs (name, short_name, abbreviation) VALUES (?, ?, ?)')
          .run(t.name, t.shortName ?? null, t.abbreviation ?? null).lastInsertRowid
      )
      this.link('club', clubId, t.clubRef)
    } else if (opts.updateClubName) {
      this.db
        .prepare('UPDATE clubs SET name = ?, short_name = ?, abbreviation = ?, updated_at = ? WHERE id = ?')
        .run(t.name, t.shortName ?? null, t.abbreviation ?? null, nowIso(), clubId)
    }
    if (t.clubRef.url) this.link('club', clubId, t.clubRef)

    this.db
      .prepare(
        `INSERT INTO teams (club_id, competition_season_id, name, short_name, abbreviation, primary_color, text_color, logo_url, source_slug)
         VALUES (@club, @cs, @name, @short, @abbr, @color, @text, @logo, @slug)
         ON CONFLICT (club_id, competition_season_id) DO UPDATE SET
           name = excluded.name,
           short_name = COALESCE(excluded.short_name, short_name),
           abbreviation = COALESCE(excluded.abbreviation, abbreviation),
           primary_color = COALESCE(excluded.primary_color, primary_color),
           text_color = COALESCE(excluded.text_color, text_color),
           logo_url = COALESCE(excluded.logo_url, logo_url),
           source_slug = COALESCE(excluded.source_slug, source_slug)`
      )
      .run({
        club: clubId,
        cs: csId,
        name: t.name,
        short: t.shortName ?? null,
        abbr: t.abbreviation ?? null,
        color: t.primaryColor ?? null,
        text: t.textColor ?? null,
        logo: t.logoUrl ?? null,
        slug: t.slug ?? null
      })
    const team = this.db
      .prepare('SELECT id FROM teams WHERE club_id = ? AND competition_season_id = ?')
      .get(clubId, csId) as { id: number }
    this.link('team', team.id, t.ref)
    return team.id
  }

  // ───────── jugadores / entrenadores ─────────
  upsertPlayer(p: NPlayer, opts: { bio?: boolean } = {}): number {
    const values = {
      first: p.firstName ?? null,
      last: p.lastName ?? null,
      full: p.fullName,
      known: p.knownAs ?? null,
      bdate: p.birthDate ?? null,
      bplace: p.birthPlace ?? null,
      bcountry: p.birthCountry ?? null,
      nat: p.nationality ?? null,
      height: p.heightCm ?? null,
      pos: p.position ?? null,
      poscode: p.positionCode ?? null,
      photo: p.photoUrl ?? null,
      bio: opts.bio ? nowIso() : null,
      now: nowIso()
    }
    let id = this.findId('player', p.ref)
    if (id == null) {
      id = Number(
        this.db
          .prepare(
            `INSERT INTO players (first_name, last_name, full_name, known_as, birth_date, birth_place, birth_country,
               nationality, height_cm, position, position_code, photo_url, bio_synced_at)
             VALUES (@first, @last, @full, @known, @bdate, @bplace, @bcountry, @nat, @height, @pos, @poscode, @photo, @bio)`
          )
          .run(values).lastInsertRowid
      )
      this.link('player', id, p.ref)
      return id
    }
    // Nunca pisamos un dato conocido con un vacío.
    this.db
      .prepare(
        `UPDATE players SET
           first_name = COALESCE(@first, first_name), last_name = COALESCE(@last, last_name),
           full_name = COALESCE(@full, full_name), known_as = @known,
           birth_date = COALESCE(@bdate, birth_date), birth_place = COALESCE(@bplace, birth_place),
           birth_country = COALESCE(@bcountry, birth_country), nationality = COALESCE(@nat, nationality),
           height_cm = COALESCE(@height, height_cm), position = COALESCE(@pos, position),
           position_code = COALESCE(@poscode, position_code), photo_url = COALESCE(@photo, photo_url),
           bio_synced_at = COALESCE(@bio, bio_synced_at), updated_at = @now
         WHERE id = @id`
      )
      .run({ ...values, id })
    if (p.ref.url) this.link('player', id, p.ref)
    return id
  }

  upsertCoach(c: NCoach): number {
    let id = this.findId('coach', c.ref)
    if (id == null) {
      id = Number(
        this.db
          .prepare('INSERT INTO coaches (first_name, last_name, full_name, photo_url) VALUES (?, ?, ?, ?)')
          .run(c.firstName ?? null, c.lastName ?? null, c.fullName, c.photoUrl ?? null).lastInsertRowid
      )
      this.link('coach', id, c.ref)
    } else {
      this.db
        .prepare('UPDATE coaches SET full_name = ?, photo_url = COALESCE(?, photo_url) WHERE id = ?')
        .run(c.fullName, c.photoUrl ?? null, id)
    }
    return id
  }

  // ───────── plantillas ─────────
  upsertRosterEntry(teamId: number, playerId: number, e: Omit<NRosterEntry, 'player'>) {
    this.db
      .prepare(
        `INSERT INTO roster_entries (team_id, player_id, jersey_number, position, position_code, license_type, is_active, joined_on, last_seen_at)
         VALUES (@team, @player, @num, @pos, @code, @lic, @active, date('now'), @now)
         ON CONFLICT (team_id, player_id) DO UPDATE SET
           jersey_number = COALESCE(excluded.jersey_number, jersey_number),
           position = COALESCE(excluded.position, position),
           position_code = COALESCE(excluded.position_code, position_code),
           license_type = COALESCE(excluded.license_type, license_type),
           is_active = excluded.is_active,
           left_on = CASE WHEN excluded.is_active = 0 AND is_active = 1 THEN date('now')
                          WHEN excluded.is_active = 1 THEN NULL ELSE left_on END,
           last_seen_at = excluded.last_seen_at`
      )
      .run({
        team: teamId,
        player: playerId,
        num: e.jerseyNumber ?? null,
        pos: e.position ?? null,
        code: e.positionCode ?? null,
        lic: e.licenseType ?? null,
        active: e.isActive ? 1 : 0,
        now: nowIso()
      })
  }

  /** Jugador visto en un boxscore: garantiza que figura en la plantilla sin tocar su estado. */
  ensureRosterEntry(teamId: number, playerId: number, jerseyNumber?: string) {
    this.db
      .prepare(
        `INSERT INTO roster_entries (team_id, player_id, jersey_number) VALUES (?, ?, ?)
         ON CONFLICT (team_id, player_id) DO NOTHING`
      )
      .run(teamId, playerId, jerseyNumber ?? null)
  }

  /** Marca como baja a quien estaba activo y ya no aparece en la plantilla oficial. */
  deactivateMissing(teamId: number, seenPlayerIds: number[]) {
    if (seenPlayerIds.length === 0) return 0
    const placeholders = seenPlayerIds.map(() => '?').join(',')
    return this.db
      .prepare(
        `UPDATE roster_entries SET is_active = 0, left_on = date('now')
         WHERE team_id = ? AND is_active = 1 AND player_id NOT IN (${placeholders})`
      )
      .run(teamId, ...seenPlayerIds).changes
  }

  setStaff(teamId: number, staff: { coachId: number; role: NCoach['role'] }[]) {
    this.db.prepare('DELETE FROM team_staff WHERE team_id = ?').run(teamId)
    const ins = this.db.prepare('INSERT OR IGNORE INTO team_staff (team_id, coach_id, role) VALUES (?, ?, ?)')
    for (const s of staff) ins.run(teamId, s.coachId, s.role)
  }

  // ───────── calendario ─────────
  upsertRound(csId: number, r: NRound): number {
    this.db
      .prepare(
        `INSERT INTO rounds (competition_season_id, phase, number, name) VALUES (?, ?, ?, ?)
         ON CONFLICT (competition_season_id, phase, number) DO UPDATE SET name = COALESCE(excluded.name, name)`
      )
      .run(csId, r.phase, r.number, r.name ?? null)
    const row = this.db
      .prepare('SELECT id FROM rounds WHERE competition_season_id = ? AND phase = ? AND number = ?')
      .get(csId, r.phase, r.number) as { id: number }
    if (r.ref) this.link('round', row.id, r.ref)
    return row.id
  }

  refreshRoundDates(csId: number) {
    this.db
      .prepare(
        `UPDATE rounds SET
           start_date = (SELECT substr(MIN(scheduled_at), 1, 10) FROM games WHERE round_id = rounds.id),
           end_date   = (SELECT substr(MAX(scheduled_at), 1, 10) FROM games WHERE round_id = rounds.id)
         WHERE competition_season_id = ?`
      )
      .run(csId)
  }

  upsertGame(
    csId: number,
    g: Pick<NGame, 'ref' | 'round' | 'scheduledAt' | 'status' | 'homeScore' | 'awayScore'>,
    homeTeamId: number,
    awayTeamId: number
  ): number {
    const roundId = g.round ? this.upsertRound(csId, g.round) : null
    const values = {
      cs: csId,
      round: roundId,
      home: homeTeamId,
      away: awayTeamId,
      at: g.scheduledAt ?? null,
      status: g.status,
      hs: g.homeScore ?? null,
      as: g.awayScore ?? null,
      now: nowIso()
    }
    const id = this.findId('game', g.ref)
    if (id == null) {
      const newId = Number(
        this.db
          .prepare(
            `INSERT INTO games (competition_season_id, round_id, home_team_id, away_team_id, scheduled_at, status, home_score, away_score)
             VALUES (@cs, @round, @home, @away, @at, @status, @hs, @as)`
          )
          .run(values).lastInsertRowid
      )
      this.link('game', newId, g.ref)
      return newId
    }
    this.db
      .prepare(
        `UPDATE games SET round_id = COALESCE(@round, round_id), home_team_id = @home, away_team_id = @away,
           scheduled_at = COALESCE(@at, scheduled_at), status = @status,
           home_score = @hs, away_score = @as, updated_at = @now
         WHERE id = @id`
      )
      .run({ ...values, id })
    return id
  }

  // ───────── boxscores ─────────
  saveBoxscore(csId: number, box: NBoxscore, extra: Pick<NGame, 'round'> = {}): number {
    return this.transaction(() => {
      const homeId = this.upsertTeam(csId, box.homeTeam)
      const awayId = this.upsertTeam(csId, box.awayTeam)
      const gameId = this.upsertGame(
        csId,
        {
          ref: box.gameRef,
          round: extra.round,
          scheduledAt: box.scheduledAt,
          status: box.status,
          homeScore: box.homeScore,
          awayScore: box.awayScore
        },
        homeId,
        awayId
      )

      const periodsPlayed = box.periodScores.length || null
      this.db
        .prepare(
          `UPDATE games SET arena = COALESCE(?, arena), attendance = COALESCE(?, attendance),
             referees = ?, periods_played = COALESCE(?, periods_played), boxscore_synced_at = ? WHERE id = ?`
        )
        .run(
          box.arena ?? null,
          box.attendance ?? null,
          box.referees.length ? JSON.stringify(box.referees) : null,
          periodsPlayed,
          box.teams.length ? nowIso() : null,
          gameId
        )

      this.db.prepare('DELETE FROM game_period_scores WHERE game_id = ?').run(gameId)
      const insScore = this.db.prepare(
        'INSERT INTO game_period_scores (game_id, period, home_points, away_points) VALUES (?, ?, ?, ?)'
      )
      for (const q of box.periodScores) if (q.period >= 1) insScore.run(gameId, q.period, q.home, q.away)

      if (box.teams.length === 0) return gameId

      this.db.prepare('DELETE FROM player_game_stats WHERE game_id = ?').run(gameId)
      this.db.prepare('DELETE FROM team_game_stats WHERE game_id = ?').run(gameId)
      const insPlayer = this.db.prepare(
        `INSERT OR REPLACE INTO player_game_stats (game_id, period, player_id, team_id, jersey_number, is_starter, seconds, points,
           fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, blk_against, dunks, pf, fouls_drawn, plus_minus, pir)
         VALUES (@game, @period, @player, @team, @num, @starter, @seconds, @points,
           @fg2m, @fg2a, @fg3m, @fg3a, @ftm, @fta, @oreb, @dreb, @reb, @ast, @stl, @tov, @blk, @blkAgainst, @dunks, @pf, @foulsDrawn, @plusMinus, @pir)`
      )
      const insTeam = this.db.prepare(
        `INSERT OR REPLACE INTO team_game_stats (game_id, period, team_id, is_home, points,
           fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, blk_against, dunks, pf, fouls_drawn, pir,
           team_oreb, team_dreb, team_tov, head_coach)
         VALUES (@game, @period, @team, @isHome, @points,
           @fg2m, @fg2a, @fg3m, @fg3a, @ftm, @fta, @oreb, @dreb, @reb, @ast, @stl, @tov, @blk, @blkAgainst, @dunks, @pf, @foulsDrawn, @pir,
           @teamOreb, @teamDreb, @teamTov, @coach)`
      )
      const stat = (s: NStatLine) => ({ ...s, plusMinus: s.plusMinus ?? null, pir: s.pir ?? null })

      for (const tb of box.teams) {
        const teamId = this.upsertTeam(csId, tb.team)
        const playerIds = new Map<string, number>()
        for (const period of tb.periods) {
          for (const line of period.players) {
            let playerId = playerIds.get(line.player.ref.id)
            if (playerId == null) {
              playerId = this.upsertPlayer(line.player)
              playerIds.set(line.player.ref.id, playerId)
              this.ensureRosterEntry(teamId, playerId, line.jerseyNumber)
            }
            insPlayer.run({
              ...stat(line),
              game: gameId,
              period: period.period,
              player: playerId,
              team: teamId,
              num: line.jerseyNumber ?? null,
              starter: line.isStarter ? 1 : 0
            })
          }
          const { seconds: _s, plusMinus: _pm, ...total } = stat(period.total)
          insTeam.run({
            ...total,
            game: gameId,
            period: period.period,
            team: teamId,
            isHome: tb.isHome ? 1 : 0,
            teamOreb: period.teamOnly.oreb,
            teamDreb: period.teamOnly.dreb,
            teamTov: period.teamOnly.tov,
            coach: tb.headCoach ?? null
          })
        }
      }
      return gameId
    })
  }

  // ───────── registro de ejecuciones ─────────
  startRun(source: string, scope: string): number {
    return Number(
      this.db.prepare('INSERT INTO scrape_runs (source, scope) VALUES (?, ?)').run(source, scope).lastInsertRowid
    )
  }

  finishRun(
    runId: number,
    data: { csId?: number; status: 'ok' | 'partial' | 'error'; requests: number; summary: unknown; errors: unknown[] }
  ) {
    this.db
      .prepare(
        `UPDATE scrape_runs SET finished_at = ?, status = ?, requests = ?, summary = ?, errors = ?,
           competition_season_id = COALESCE(?, competition_season_id) WHERE id = ?`
      )
      .run(
        nowIso(),
        data.status,
        data.requests,
        JSON.stringify(data.summary),
        data.errors.length ? JSON.stringify(data.errors) : null,
        data.csId ?? null,
        runId
      )
  }
}
