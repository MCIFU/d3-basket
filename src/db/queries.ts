/** Consultas de lectura para la interfaz (y la gestión de informes de scouting). */
import type { DB } from './database'
import {
  LEADER_STATS,
  type EditionRow,
  type GameDetail,
  type GameRow,
  type LeaderRow,
  type LeaderStat,
  type PlayerDetail,
  type RosterRow,
  type ScoutingReport,
  type SearchResult,
  type StandingRow,
  type TeamRow
} from '../shared/api'

const DISPLAY_NAME = 'COALESCE(p.known_as, p.full_name)'

const GAME_SELECT = `
  SELECT g.id, rd.name AS round_name, rd.number AS round_number, rd.phase, g.scheduled_at, g.status,
         g.home_team_id, ht.name AS home_name, ht.abbreviation AS home_abbr, ht.logo_url AS home_logo,
         g.away_team_id, at.name AS away_name, at.abbreviation AS away_abbr, at.logo_url AS away_logo,
         g.home_score, g.away_score, (g.boxscore_synced_at IS NOT NULL) AS has_boxscore
  FROM games g
  JOIN teams ht ON ht.id = g.home_team_id
  JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN rounds rd ON rd.id = g.round_id`

const STAT_COLS = `s.seconds, s.points, s.fg2m, s.fg2a, s.fg3m, s.fg3a, s.ftm, s.fta, s.oreb, s.dreb, s.reb,
  s.ast, s.stl, s.tov, s.blk, s.pf, s.plus_minus, s.pir`

export class Queries {
  constructor(private readonly db: DB) {}

  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const t of ['competition_seasons', 'teams', 'players', 'games', 'player_game_stats', 'scouting_reports']) {
      out[t] = (this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
    }
    return out
  }

  editions(): EditionRow[] {
    return this.db
      .prepare(
        `SELECT cs.id, c.code AS competition_code, c.name AS competition_name, s.label AS season_label, s.start_year,
                cs.is_current, cs.last_synced_at,
                (SELECT COUNT(*) FROM teams t WHERE t.competition_season_id = cs.id) AS teams,
                (SELECT COUNT(*) FROM games g WHERE g.competition_season_id = cs.id) AS games,
                (SELECT COUNT(*) FROM games g WHERE g.competition_season_id = cs.id AND g.status = 'finished') AS finished
         FROM competition_seasons cs
         JOIN competitions c ON c.id = cs.competition_id
         JOIN seasons s ON s.id = cs.season_id
         ORDER BY c.tier, s.start_year DESC`
      )
      .all() as EditionRow[]
  }

  standings(csId: number): StandingRow[] {
    return this.db
      .prepare(
        `SELECT team_id, team_name, logo_url, played, won, lost, points_for, points_against, diff
         FROM v_standings WHERE competition_season_id = ?
         ORDER BY won DESC, diff DESC, points_for DESC`
      )
      .all(csId) as StandingRow[]
  }

  teams(csId: number): TeamRow[] {
    return this.db
      .prepare(
        `SELECT t.*, s.label AS season_label FROM teams t
         JOIN competition_seasons cs ON cs.id = t.competition_season_id
         JOIN seasons s ON s.id = cs.season_id
         WHERE t.competition_season_id = ? ORDER BY t.name`
      )
      .all(csId) as TeamRow[]
  }

  team(teamId: number) {
    const team = this.db
      .prepare(
        `SELECT t.*, s.label AS season_label FROM teams t
         JOIN competition_seasons cs ON cs.id = t.competition_season_id
         JOIN seasons s ON s.id = cs.season_id WHERE t.id = ?`
      )
      .get(teamId) as TeamRow
    const roster = this.db
      .prepare(
        `SELECT p.id AS player_id, ${DISPLAY_NAME} AS display_name, r.jersey_number, r.position, r.position_code,
                r.license_type, p.nationality, p.height_cm, p.birth_date, p.photo_url, r.is_active,
                v.games, v.ppg, v.rpg, v.apg, v.pir
         FROM roster_entries r
         JOIN players p ON p.id = r.player_id
         LEFT JOIN v_player_season_stats v ON v.player_id = p.id AND v.team_id = r.team_id
         WHERE r.team_id = ?
         ORDER BY r.is_active DESC, CAST(r.jersey_number AS INTEGER)`
      )
      .all(teamId) as RosterRow[]
    const staff = this.db
      .prepare(
        `SELECT c.full_name AS name, s.role FROM team_staff s JOIN coaches c ON c.id = s.coach_id
         WHERE s.team_id = ? ORDER BY s.role DESC, c.full_name`
      )
      .all(teamId) as { name: string; role: string }[]
    const games = this.db
      .prepare(`${GAME_SELECT} WHERE g.home_team_id = ? OR g.away_team_id = ? ORDER BY g.scheduled_at IS NULL, g.scheduled_at`)
      .all(teamId, teamId) as GameRow[]
    return { team, roster, staff, games }
  }

  games(csId: number): GameRow[] {
    return this.db
      .prepare(`${GAME_SELECT} WHERE g.competition_season_id = ? ORDER BY rd.phase DESC, rd.number, g.scheduled_at`)
      .all(csId) as GameRow[]
  }

  game(gameId: number): GameDetail {
    const g = this.db
      .prepare(
        `${GAME_SELECT.replace('SELECT g.id,', 'SELECT g.id, g.arena, g.attendance, g.referees, s.label AS season_label,')}
         JOIN competition_seasons cs ON cs.id = g.competition_season_id
         JOIN seasons s ON s.id = cs.season_id
         WHERE g.id = ?`
      )
      .get(gameId) as GameDetail['game'] & { referees: string | null }
    const periods = this.db
      .prepare('SELECT period, home_points, away_points FROM game_period_scores WHERE game_id = ? ORDER BY period')
      .all(gameId) as GameDetail['periods']
    const teams = [g.home_team_id, g.away_team_id].map((teamId) => {
      const lines = this.db
        .prepare(
          `SELECT p.id AS player_id, ${DISPLAY_NAME} AS display_name, s.jersey_number, s.is_starter, ${STAT_COLS}
           FROM player_game_stats s JOIN players p ON p.id = s.player_id
           WHERE s.game_id = ? AND s.team_id = ? AND s.period = 0
           ORDER BY s.is_starter DESC, s.seconds DESC`
        )
        .all(gameId, teamId) as GameDetail['teams'][number]['lines']
      const total = this.db
        .prepare(
          `SELECT points, fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, pf, pir, head_coach
           FROM team_game_stats WHERE game_id = ? AND team_id = ? AND period = 0`
        )
        .get(gameId, teamId) as (GameDetail['teams'][number]['total'] & { head_coach: string | null }) | undefined
      return {
        team_id: teamId,
        is_home: teamId === g.home_team_id ? 1 : 0,
        name: teamId === g.home_team_id ? g.home_name : g.away_name,
        head_coach: total?.head_coach ?? null,
        lines,
        total: total ?? ({} as GameDetail['teams'][number]['total'])
      }
    })
    return { game: { ...g, referees: g.referees ? (JSON.parse(g.referees) as string[]) : [] }, periods, teams }
  }

  player(playerId: number): PlayerDetail {
    const player = this.db
      .prepare(
        `SELECT p.id, ${DISPLAY_NAME} AS display_name, p.full_name, p.first_name, p.last_name, p.birth_date,
                p.birth_place, p.birth_country, p.nationality, p.height_cm, p.position, p.position_code, p.photo_url,
                (SELECT 'https://acb.com/es/liga/jugadores/jugador-' || external_id FROM external_ids
                 WHERE entity_type = 'player' AND entity_id = p.id AND source = 'acb') AS acb_url
         FROM players p WHERE p.id = ?`
      )
      .get(playerId) as PlayerDetail['player']
    const seasons = this.db
      .prepare(
        `SELECT t.id AS team_id, t.name AS team_name, s.label AS season_label, c.code AS competition_code,
                r.jersey_number, r.is_active, v.games, v.mpg, v.ppg, v.rpg, v.apg, v.spg, v.bpg, v.pir,
                v.fg2_pct, v.fg3_pct, v.ft_pct, v.ts_pct, v.efg_pct
         FROM roster_entries r
         JOIN teams t ON t.id = r.team_id
         JOIN competition_seasons cs ON cs.id = t.competition_season_id
         JOIN seasons s ON s.id = cs.season_id
         JOIN competitions c ON c.id = cs.competition_id
         LEFT JOIN v_player_season_stats v ON v.player_id = r.player_id AND v.team_id = r.team_id
         WHERE r.player_id = ?
         ORDER BY s.start_year DESC, c.tier`
      )
      .all(playerId) as PlayerDetail['seasons']
    const gameLog = this.db
      .prepare(
        `SELECT g.id AS game_id, g.scheduled_at, (g.home_team_id = s.team_id) AS is_home,
                CASE WHEN g.home_team_id = s.team_id THEN at.name ELSE ht.name END AS opponent,
                CASE WHEN g.home_team_id = s.team_id THEN g.home_score ELSE g.away_score END AS team_score,
                CASE WHEN g.home_team_id = s.team_id THEN g.away_score ELSE g.home_score END AS opp_score,
                p.id AS player_id, ${DISPLAY_NAME} AS display_name, s.jersey_number, s.is_starter, ${STAT_COLS}
         FROM player_game_stats s
         JOIN games g ON g.id = s.game_id
         JOIN teams ht ON ht.id = g.home_team_id
         JOIN teams at ON at.id = g.away_team_id
         JOIN players p ON p.id = s.player_id
         WHERE s.player_id = ? AND s.period = 0
         ORDER BY g.scheduled_at DESC LIMIT 100`
      )
      .all(playerId) as PlayerDetail['gameLog']
    return { player, seasons, gameLog, reports: this.reports(playerId) }
  }

  leaders(csId: number, stat: LeaderStat): LeaderRow[] {
    if (!(stat in LEADER_STATS)) throw new Error(`Estadística no válida: ${stat}`)
    // Mínimos para entrar en el ranking: la mitad de los partidos del que más ha jugado,
    // 10 min por partido y, en porcentajes, 5 tiros "reales" (FGA + 0.44·FTA) por partido.
    const volume = stat === 'ts_pct' ? 'AND (b.fga + 0.44 * b.fta) >= 5 * b.games' : ''
    return this.db
      .prepare(
        `WITH base AS (
           SELECT v.* FROM v_player_season_stats v WHERE v.competition_season_id = ?
         )
         SELECT b.player_id, COALESCE(p.known_as, p.full_name) AS display_name, b.team_name, b.games, b.${stat} AS value
         FROM base b JOIN players p ON p.id = b.player_id
         WHERE b.${stat} IS NOT NULL AND b.games >= (SELECT MAX(games) FROM base) / 2.0
           AND b.mpg >= 10 ${volume}
         ORDER BY value DESC LIMIT 15`
      )
      .all(csId) as LeaderRow[]
  }

  search(q: string): SearchResult[] {
    const term = `%${q.trim().normalize('NFC')}%`
    if (q.trim().length < 2) return []
    return this.db
      .prepare(
        `SELECT p.id AS player_id, ${DISPLAY_NAME} AS display_name, p.position,
                (SELECT t.name FROM roster_entries r JOIN teams t ON t.id = r.team_id
                 WHERE r.player_id = p.id ORDER BY t.competition_season_id DESC, r.is_active DESC LIMIT 1) AS team_name,
                (SELECT s.label FROM roster_entries r JOIN teams t ON t.id = r.team_id
                 JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN seasons s ON s.id = cs.season_id
                 WHERE r.player_id = p.id ORDER BY s.start_year DESC LIMIT 1) AS season_label
         FROM players p
         WHERE p.full_name LIKE ? OR p.known_as LIKE ?
         ORDER BY display_name LIMIT 30`
      )
      .all(term, term) as SearchResult[]
  }

  // ───────── scouting ─────────
  reports(playerId?: number): ScoutingReport[] {
    const rows = this.db
      .prepare(
        `SELECT r.*, ${DISPLAY_NAME} AS player_name FROM scouting_reports r JOIN players p ON p.id = r.player_id
         ${playerId ? 'WHERE r.player_id = ?' : ''} ORDER BY r.updated_at DESC`
      )
      .all(...(playerId ? [playerId] : [])) as ScoutingReport[]
    const ratings = this.db.prepare('SELECT attribute, score, note FROM scouting_ratings WHERE report_id = ? ORDER BY rowid')
    return rows.map((r) => ({ ...r, ratings: ratings.all(r.id) as ScoutingReport['ratings'] }))
  }

  saveReport(r: ScoutingReport): number {
    const fields = [
      'player_id', 'season_id', 'team_id', 'author', 'report_date', 'role', 'archetype', 'strengths', 'weaknesses',
      'offense_notes', 'defense_notes', 'physical_notes', 'intangibles', 'comparables', 'projection',
      'current_level', 'potential', 'recommendation'
    ] as const
    const values = Object.fromEntries(fields.map((f) => [f, r[f] ?? null])) as Record<string, unknown>
    values.report_date ??= new Date().toISOString().slice(0, 10)
    return this.db.transaction(() => {
      let id = r.id
      if (id) {
        this.db
          .prepare(
            `UPDATE scouting_reports SET ${fields.map((f) => `${f} = @${f}`).join(', ')},
               updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = @id`
          )
          .run({ ...values, id })
      } else {
        id = Number(
          this.db
            .prepare(`INSERT INTO scouting_reports (${fields.join(', ')}) VALUES (${fields.map((f) => `@${f}`).join(', ')})`)
            .run(values).lastInsertRowid
        )
      }
      this.db.prepare('DELETE FROM scouting_ratings WHERE report_id = ?').run(id)
      const ins = this.db.prepare('INSERT INTO scouting_ratings (report_id, attribute, score, note) VALUES (?, ?, ?, ?)')
      for (const rt of r.ratings ?? []) if (rt.score >= 1 && rt.score <= 10) ins.run(id, rt.attribute, rt.score, rt.note ?? null)
      return id
    })()
  }

  deleteReport(id: number) {
    this.db.prepare('DELETE FROM scouting_reports WHERE id = ?').run(id)
  }
}
