/**
 * Consultas de lectura para la interfaz (y la gestión de informes de scouting).
 * Solo dependen de `SqlDb`, así funcionan igual con better-sqlite3 (escritorio)
 * que con sql.js en el navegador (versión web).
 */
import type {
  ClubData,
  ClubHonour,
  ClubInfo,
  ClubRecordRow,
  CompetitionInfo,
  EditionRow,
  GameDetail,
  GameRow,
  HomeData,
  HonourRow,
  LeaderRow,
  LeagueData,
  PlayerCareer,
  PlayerData,
  PlayerGameLog,
  PlayerIndexRow,
  PlayerStatRow,
  RosterRow,
  ScoutingReport,
  SearchResult,
  StandingRow,
  StatBlock,
  TeamLite,
  TeamStatRow,
  TrajectoryRow
} from '../shared/api'

/** Subconjunto de la API de better-sqlite3 que usan las consultas. */
export interface SqlStatement {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number }
}
export interface SqlDb {
  prepare(sql: string): SqlStatement
  transaction<T>(fn: () => T): () => T
}

type Row = Record<string, any>

const DISPLAY_NAME = 'COALESCE(p.known_as, p.full_name)'

/** Columnas de un equipo con prefijo, para reconstruir un TeamLite. */
const teamCols = (alias: string, prefix: string) => `
  ${alias}.id AS ${prefix}team_id, ${prefix}cr.ref AS ${prefix}club_ref, ${alias}.name AS ${prefix}name,
  ${alias}.short_name AS ${prefix}short_name, ${alias}.abbreviation AS ${prefix}abbr,
  COALESCE(${alias}.logo_url, ${prefix}c.logo_url) AS ${prefix}logo, COALESCE(${alias}.primary_color, ${prefix}c.primary_color) AS ${prefix}color`
const teamJoins = (alias: string, prefix: string) => `
  LEFT JOIN clubs ${prefix}c ON ${prefix}c.id = ${alias}.club_id
  LEFT JOIN v_club_ref ${prefix}cr ON ${prefix}cr.club_id = ${alias}.club_id`

const team = (r: Row, prefix = ''): TeamLite => ({
  team_id: r[`${prefix}team_id`],
  club_ref: r[`${prefix}club_ref`],
  name: r[`${prefix}name`],
  short_name: r[`${prefix}short_name`] ?? null,
  abbr: r[`${prefix}abbr`] ?? null,
  logo: r[`${prefix}logo`] ?? null,
  color: r[`${prefix}color`] ?? null
})

const GAME_SELECT = `
  SELECT g.id, gr.ref, rd.name AS round_name, rd.number AS round_number, rd.phase, g.scheduled_at, g.status,
         g.home_score, g.away_score, (g.boxscore_synced_at IS NOT NULL) AS has_boxscore, g.attendance, g.arena,
         g.competition_season_id, ht.group_name,
         ${teamCols('ht', 'h_')}, ${teamCols('at', 'a_')}
  FROM games g
  JOIN teams ht ON ht.id = g.home_team_id
  JOIN teams at ON at.id = g.away_team_id
  ${teamJoins('ht', 'h_')} ${teamJoins('at', 'a_')}
  LEFT JOIN v_game_ref gr ON gr.game_id = g.id
  LEFT JOIN rounds rd ON rd.id = g.round_id`

const toGame = (r: Row): GameRow => ({
  id: r.id,
  ref: r.ref,
  round_name: r.round_name,
  round_number: r.round_number,
  phase: r.phase,
  scheduled_at: r.scheduled_at,
  status: r.status,
  home: team(r, 'h_'),
  away: team(r, 'a_'),
  home_score: r.home_score,
  away_score: r.away_score,
  has_boxscore: r.has_boxscore,
  attendance: r.attendance,
  arena: r.arena,
  group: r.group_name ?? null
})

const SUM_COLS = `COUNT(*) AS games, SUM(s.seconds) AS seconds, SUM(s.points) AS pts, SUM(s.reb) AS reb,
  SUM(s.oreb) AS oreb, SUM(s.dreb) AS dreb, SUM(s.ast) AS ast, SUM(s.stl) AS stl, SUM(s.blk) AS blk,
  SUM(s.tov) AS tov, SUM(s.pf) AS pf, SUM(s.fouls_drawn) AS fd, SUM(COALESCE(s.pir, 0)) AS pir,
  SUM(COALESCE(s.plus_minus, 0)) AS pm, SUM(s.dunks) AS dunks, SUM(s.fg2m) AS fg2m, SUM(s.fg2a) AS fg2a,
  SUM(s.fg3m) AS fg3m, SUM(s.fg3a) AS fg3a, SUM(s.ftm) AS ftm, SUM(s.fta) AS fta`

/** Igual que SUM_COLS para team_game_stats (no guarda minutos ni +/-). */
const TEAM_SUM_COLS = SUM_COLS.replace('SUM(s.seconds)', '0').replace('SUM(COALESCE(s.plus_minus, 0))', '0')

const round1 = (v: number) => Math.round(v * 10) / 10
const pct = (m: number, a: number) => (a > 0 ? round1((100 * m) / a) : null)

/** Añade medias por partido y porcentajes a una fila de totales. */
export function withRates<T extends Row>(r: T): T & StatBlock {
  const g = Number(r.games) || 0
  const per = (v: number) => (g ? round1((Number(v) || 0) / g) : 0)
  const fga = (r.fg2a ?? 0) + (r.fg3a ?? 0)
  const fgm = (r.fg2m ?? 0) + (r.fg3m ?? 0)
  return {
    ...r,
    mpg: g ? round1((Number(r.seconds) || 0) / 60 / g) : 0,
    ppg: per(r.pts),
    rpg: per(r.reb),
    orpg: per(r.oreb),
    drpg: per(r.dreb),
    apg: per(r.ast),
    spg: per(r.stl),
    bpg: per(r.blk),
    tpg: per(r.tov),
    pfpg: per(r.pf),
    pirpg: per(r.pir),
    pmpg: per(r.pm),
    fg_pct: pct(fgm, fga),
    fg2_pct: pct(r.fg2m ?? 0, r.fg2a ?? 0),
    fg3_pct: pct(r.fg3m ?? 0, r.fg3a ?? 0),
    ft_pct: pct(r.ftm ?? 0, r.fta ?? 0),
    ts_pct: fga + (r.fta ?? 0) > 0 ? round1((100 * (r.pts ?? 0)) / (2 * (fga + 0.44 * (r.fta ?? 0)))) : null,
    efg_pct: fga > 0 ? round1((100 * (fgm + 0.5 * (r.fg3m ?? 0))) / fga) : null
  } as T & StatBlock
}

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string' || !v) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

/**
 * Puesto del jugador en su liga en cada estadística (1 = mejor), contra los jugadores con
 * al menos el 40 % de los partidos del que más ha jugado; los porcentajes exigen además
 * un mínimo de intentos por partido. Si el jugador no llega al mínimo no tiene puesto.
 */
export const RANKED: { key: keyof StatBlock; lower?: boolean; min?: (r: StatBlock) => boolean }[] = [
  { key: 'ppg' }, { key: 'rpg' }, { key: 'orpg' }, { key: 'drpg' }, { key: 'apg' }, { key: 'spg' }, { key: 'bpg' },
  { key: 'tpg', lower: true }, { key: 'pirpg' }, { key: 'mpg' }, { key: 'pmpg' },
  { key: 'ts_pct', min: (r) => r.fg2a + r.fg3a >= 2 * r.games },
  { key: 'fg2_pct', min: (r) => r.fg2a >= 1.5 * r.games },
  { key: 'fg3_pct', min: (r) => r.fg3a >= r.games },
  { key: 'ft_pct', min: (r) => r.fta >= 0.7 * r.games }
]
export function leagueRanks(all: StatBlock[], me: StatBlock): Record<string, { rank: number; of: number }> {
  const maxGames = Math.max(0, ...all.map((r) => r.games))
  const qualified = all.filter((r) => r.games >= Math.max(1, Math.ceil(0.4 * maxGames)))
  if (!qualified.includes(me)) return {}
  const out: Record<string, { rank: number; of: number }> = {}
  for (const { key, lower, min } of RANKED) {
    const pool = qualified.filter((r) => r[key] != null && (!min || min(r)))
    const v = me[key] as number | null
    if (v == null || !pool.includes(me)) continue
    const better = pool.filter((r) => (lower ? (r[key] as number) < v : (r[key] as number) > v)).length
    out[key] = { rank: better + 1, of: pool.length }
  }
  return out
}

/**
 * Apartado de la carrera al que pertenece un partido o una temporada: liga con el primer
 * equipo, con un filial, copa, competiciones europeas o selección (estas dos, para el futuro).
 */
export type CareerSection = 'liga' | 'filial' | 'copa' | 'europa' | 'seleccion'
const EUROPE = /^(EUROLEAGUE|EUROCUP|BCL|FIBA_EUROPE_CUP|CHAMPIONS)/
export function sectionOf(code: string, parentName: string | null | undefined): CareerSection {
  if (/^(SELECCION|NATIONAL)/.test(code)) return 'seleccion'
  if (EUROPE.test(code)) return 'europa'
  if (/COPA/.test(code)) return 'copa'
  return parentName ? 'filial' : 'liga'
}

export class Queries {
  constructor(private readonly db: SqlDb) {}

  private all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }
  private get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  // ───────────────────────── General ─────────────────────────
  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const t of ['competition_seasons', 'clubs', 'teams', 'players', 'games', 'player_game_stats', 'honours', 'scouting_reports']) {
      out[t] = this.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n
    }
    return out
  }

  lastUpdate(): string | null {
    return this.get<{ t: string | null }>('SELECT MAX(last_synced_at) AS t FROM competition_seasons')?.t ?? null
  }

  competitions(): CompetitionInfo[] {
    return this.all<CompetitionInfo>(
      `SELECT c.code, c.name, c.short_name, c.organizer, c.tier,
              (SELECT COUNT(*) FROM competition_seasons cs WHERE cs.competition_id = c.id) AS editions,
              (SELECT s.label FROM competition_seasons cs JOIN seasons s ON s.id = cs.season_id
               WHERE cs.competition_id = c.id ORDER BY cs.is_current DESC, s.start_year DESC LIMIT 1) AS current_label
       FROM competitions c ORDER BY c.tier IS NULL, c.tier`
    )
  }

  editions(code?: string): EditionRow[] {
    return this.all<EditionRow>(
      `SELECT cs.id, c.code AS competition_code, c.name AS competition_name, s.label AS season_label, s.start_year,
              cs.is_current, cs.last_synced_at,
              (SELECT COUNT(*) FROM teams t WHERE t.competition_season_id = cs.id) AS teams,
              (SELECT COUNT(*) FROM games g WHERE g.competition_season_id = cs.id) AS games,
              (SELECT COUNT(*) FROM games g WHERE g.competition_season_id = cs.id AND g.status = 'finished') AS finished
       FROM competition_seasons cs
       JOIN competitions c ON c.id = cs.competition_id
       JOIN seasons s ON s.id = cs.season_id
       ${code ? 'WHERE c.code = ?' : ''}
       ORDER BY c.tier IS NULL, c.tier, s.start_year DESC`,
      ...(code ? [code] : [])
    )
  }

  private currentEdition(code = 'ACB'): EditionRow | undefined {
    const eds = this.editions(code)
    return eds.find((e) => e.is_current) ?? eds[0]
  }

  // ───────────────────────── Bloques reutilizables ─────────────────────────
  games(csId: number): GameRow[] {
    return this.all(
      `${GAME_SELECT} WHERE g.competition_season_id = ?
       ORDER BY rd.phase DESC, rd.number, g.scheduled_at IS NULL, g.scheduled_at`,
      csId
    ).map(toGame)
  }

  standings(csId: number): StandingRow[] {
    const rows = this.all(
      // Todos los equipos de la edición, aunque aún no hayan jugado (así se ve la composición de cada grupo).
      `SELECT COALESCE(v.played, 0) AS played, COALESCE(v.won, 0) AS won, COALESCE(v.lost, 0) AS lost,
              COALESCE(v.points_for, 0) AS points_for, COALESCE(v.points_against, 0) AS points_against,
              COALESCE(v.diff, 0) AS diff, t.group_name, ${teamCols('t', '')}
       FROM teams t ${teamJoins('t', '')}
       LEFT JOIN v_standings v ON v.team_id = t.id AND v.competition_season_id = t.competition_season_id
       WHERE t.competition_season_id = ?
       ORDER BY t.group_name, COALESCE(v.won, 0) DESC, COALESCE(v.diff, 0) DESC, COALESCE(v.points_for, 0) DESC, t.name`,
      csId
    )
    const results = this.all<{ home_team_id: number; away_team_id: number; home_score: number; away_score: number }>(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM games
       WHERE competition_season_id = ? AND status = 'finished' ORDER BY scheduled_at`,
      csId
    )
    const form = new Map<number, ('W' | 'L')[]>()
    for (const g of results) {
      const push = (id: number, won: boolean) => form.set(id, [...(form.get(id) ?? []), won ? 'W' : 'L'])
      push(g.home_team_id, g.home_score > g.away_score)
      push(g.away_team_id, g.away_score > g.home_score)
    }
    // En ligas por grupos la posición se cuenta dentro de cada grupo.
    const inGroup = new Map<string, number>()
    return rows.map((r) => {
      const position = (inGroup.get(r.group_name ?? '') ?? 0) + 1
      inGroup.set(r.group_name ?? '', position)
      return {
        ...team(r),
        group: r.group_name ?? null,
        position,
        played: r.played,
        won: r.won,
        lost: r.lost,
        points_for: r.points_for,
        points_against: r.points_against,
        diff: r.diff,
        form: (form.get(r.team_id) ?? []).slice(-5)
      }
    })
  }

  playerStats(csId: number, teamId?: number): PlayerStatRow[] {
    return this.all(
      `SELECT p.id AS player_id, pr.ref AS player_ref, ${DISPLAY_NAME} AS display_name, p.photo_url AS photo,
              p.photo_nobg_url AS photo_nobg, p.position, p.nationality, SUM(s.is_starter) AS starts,
              ${SUM_COLS}, ${teamCols('t', '')}
       FROM player_game_stats s
       JOIN players p ON p.id = s.player_id
       JOIN teams t ON t.id = s.team_id ${teamJoins('t', '')}
       LEFT JOIN v_player_ref pr ON pr.player_id = p.id
       WHERE s.period = 0 AND s.seconds > 0 AND t.competition_season_id = ? ${teamId ? 'AND t.id = ?' : ''}
       GROUP BY s.player_id, s.team_id`,
      ...(teamId ? [csId, teamId] : [csId])
    ).map((r) => withRates({ ...r, team: team(r) }) as unknown as PlayerStatRow)
  }

  teamStats(csId: number): TeamStatRow[] {
    const rows = this.all(
      `SELECT ${TEAM_SUM_COLS}, ${teamCols('t', '')},
              SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                         OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) AS opp_pts
       FROM team_game_stats s
       JOIN games g ON g.id = s.game_id AND g.status = 'finished'
       JOIN teams t ON t.id = s.team_id ${teamJoins('t', '')}
       WHERE s.period = 0 AND t.competition_season_id = ?
       GROUP BY t.id`,
      csId
    )
    const att = new Map(
      this.all<{ team_id: number; n: number; total: number; max: number }>(
        `SELECT home_team_id AS team_id, COUNT(attendance) AS n, SUM(attendance) AS total, MAX(attendance) AS max
         FROM games WHERE competition_season_id = ? AND attendance IS NOT NULL GROUP BY home_team_id`,
        csId
      ).map((a) => [a.team_id, a])
    )
    return rows.map((r) => {
      const base = withRates(r)
      const a = att.get(r.team_id)
      return {
        ...base,
        team: team(r),
        wins: r.wins,
        losses: r.games - r.wins,
        opp_pts: r.opp_pts,
        opp_ppg: round1(r.opp_pts / (r.games || 1)),
        diff_pg: round1((r.pts - r.opp_pts) / (r.games || 1)),
        home_games: a?.n ?? 0,
        attendance_total: a?.total ?? 0,
        attendance_avg: a?.n ? Math.round(a.total / a.n) : null,
        attendance_max: a?.max ?? null
      } as TeamStatRow
    })
  }

  private leadersFrom(stats: PlayerStatRow[], key: 'ppg' | 'rpg' | 'apg' | 'pirpg', n = 5): LeaderRow[] {
    const maxGames = Math.max(0, ...stats.map((s) => s.games))
    return stats
      .filter((s) => s.games >= maxGames / 2 && s.mpg >= 10)
      .sort((a, b) => b[key] - a[key])
      .slice(0, n)
      .map((s) => ({
        player_ref: s.player_ref,
        display_name: s.display_name,
        photo_nobg: s.photo_nobg,
        photo: s.photo,
        team: s.team,
        games: s.games,
        value: s[key]
      }))
  }

  honours(): HonourRow[] {
    return this.all<HonourRow>(
      `SELECT h.competition, h.season_start_year, h.label, h.champion_name, cr.ref AS champion_ref,
              c.logo_url AS champion_logo, h.runner_up_name, rr.ref AS runner_up_ref, r.logo_url AS runner_up_logo, h.result
       FROM honours h
       LEFT JOIN clubs c ON c.id = h.champion_club_id LEFT JOIN v_club_ref cr ON cr.club_id = h.champion_club_id
       LEFT JOIN clubs r ON r.id = h.runner_up_club_id LEFT JOIN v_club_ref rr ON rr.club_id = h.runner_up_club_id
       ORDER BY h.season_start_year DESC, h.competition`
    )
  }

  alltime(): ClubRecordRow[] {
    return this.all<ClubRecordRow>(
      `SELECT cr.ref AS club_ref, c.name, c.logo_url AS logo, r.scope, r.position, r.seasons, r.games, r.wins,
              r.losses, r.points_for, r.points_against, r.best_margin, r.worst_margin,
              r.first_places, r.second_places, r.third_places, r.fourth_places,
              (SELECT COUNT(*) FROM honours h WHERE h.champion_club_id = c.id AND h.competition = 'liga'
                 AND (r.scope = 'total' OR h.season_start_year >= 1983)) AS titles_liga,
              (SELECT COUNT(*) FROM honours h WHERE h.champion_club_id = c.id AND h.competition = 'copa') AS titles_copa,
              (SELECT COUNT(*) FROM honours h WHERE h.champion_club_id = c.id AND h.competition = 'supercopa') AS titles_supercopa
       FROM club_records r JOIN clubs c ON c.id = r.club_id JOIN v_club_ref cr ON cr.club_id = c.id
       ORDER BY r.scope, r.position IS NULL, r.position`
    )
  }

  // ───────────────────────── Páginas ─────────────────────────
  home(): HomeData {
    const edition = this.currentEdition()
    const competition = this.competitions().find((c) => c.code === 'ACB')
    const counts = this.counts()
    const empty = { ppg: [], rpg: [], apg: [], pirpg: [] }
    const leagues = this.competitions().map((c) => {
      const eds = this.editions(c.code)
      return { code: c.code, name: c.name, short_name: c.short_name, edition: eds.find((e) => e.is_current) ?? eds[0] }
    })
    const allHonours = this.honours()
    const champions = (['liga', 'copa', 'supercopa'] as const)
      .map((c) => allHonours.find((h) => h.competition === c))
      .filter(Boolean) as HonourRow[]
    if (!edition) {
      return {
        competition,
        edition,
        lastRound: undefined,
        nextRound: undefined,
        standings: [],
        leaders: empty,
        champions,
        leagues,
        counts: { players: counts.players, clubs: counts.clubs, games: counts.games, honours: counts.honours }
      }
    }
    const games = this.games(edition.id)
    const byRound = new Map<string, GameRow[]>()
    for (const g of games) {
      const k = g.round_name ?? 'Otros'
      byRound.set(k, [...(byRound.get(k) ?? []), g])
    }
    const rounds = [...byRound.entries()]
    const last = [...rounds].reverse().find(([, gs]) => gs.some((g) => g.status === 'finished'))
    // La próxima jornada es la primera posterior a la última jugada (un partido aplazado de una
    // jornada antigua no la convierte en "próxima"); si no hay ninguna, la primera con partidos pendientes.
    const lastIdx = last ? rounds.indexOf(last) : -1
    const next =
      rounds.slice(lastIdx + 1).find(([, gs]) => gs.some((g) => g.status !== 'finished')) ??
      rounds.find(([, gs]) => gs.some((g) => g.status !== 'finished'))
    const stats = this.playerStats(edition.id)
    return {
      competition,
      edition,
      lastRound: last && { name: last[0], games: last[1] },
      nextRound: next && { name: next[0], games: next[1] },
      standings: this.standings(edition.id),
      leaders: {
        ppg: this.leadersFrom(stats, 'ppg'),
        rpg: this.leadersFrom(stats, 'rpg'),
        apg: this.leadersFrom(stats, 'apg'),
        pirpg: this.leadersFrom(stats, 'pirpg')
      },
      champions,
      leagues,
      counts: { players: counts.players, clubs: counts.clubs, games: counts.games, honours: counts.honours }
    }
  }

  league(code: string, year?: number): LeagueData | null {
    const competition = this.competitions().find((c) => c.code === code)
    if (!competition) return null
    const editions = this.editions(code)
    const edition = year ? editions.find((e) => e.start_year === year) : (editions.find((e) => e.is_current) ?? editions[0])
    return {
      competition,
      editions,
      edition,
      standings: edition ? this.standings(edition.id) : [],
      games: edition ? this.games(edition.id) : [],
      teamStats: edition ? this.teamStats(edition.id) : [],
      playerStats: edition ? this.playerStats(edition.id) : [],
      honours: code === 'ACB' ? this.honours() : [],
      alltime: code === 'ACB' ? this.alltime() : []
    }
  }

  /** Ediciones en curso de cada competición (la más reciente si ninguna está marcada). */
  private currentEditionIds(): number[] {
    return this.competitions()
      .map((c) => this.currentEdition(c.code)?.id)
      .filter((id): id is number => id != null)
  }

  clubs() {
    const ids = this.currentEditionIds()
    if (!ids.length) return []
    return this.all(
      `SELECT ${teamCols('t', '')}, c.arena, c.founded_year, t.group_name, co.code AS competition_code, co.name AS competition_name,
              (SELECT name FROM clubs pc WHERE pc.id = c.parent_club_id) AS parent_name
       FROM teams t ${teamJoins('t', '')}
       JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN competitions co ON co.id = cs.competition_id
       -- Solo ligas: los equipos de copa (tier NULL) son los mismos clubes.
       WHERE t.competition_season_id IN (${ids.map(() => '?').join(',')}) AND co.tier IS NOT NULL ORDER BY co.tier, t.group_name, t.name`,
      ...ids
    ).map((r) => ({
      ...team(r),
      arena: r.arena as string | null,
      founded_year: r.founded_year as number | null,
      competition_code: r.competition_code as string,
      competition_name: r.competition_name as string,
      group: (r.group_name as string | null) ?? null,
      parent_name: (r.parent_name as string | null) ?? null
    }))
  }

  private clubIdByRef(ref: string): number | undefined {
    return this.get<{ club_id: number }>('SELECT club_id FROM v_club_ref WHERE ref = ?', ref)?.club_id
  }

  club(ref: string, year?: number): ClubData | null {
    const clubId = this.clubIdByRef(ref)
    if (clubId == null) return null
    const c = this.get(`SELECT c.*, cr.ref FROM clubs c JOIN v_club_ref cr ON cr.club_id = c.id WHERE c.id = ?`, clubId)!
    const seasons = this.all<ClubData['seasons'][number]>(
      `SELECT s.start_year, s.label, co.code AS competition_code, t.id AS team_id, t.name AS team_name
       FROM teams t JOIN competition_seasons cs ON cs.id = t.competition_season_id
       JOIN seasons s ON s.id = cs.season_id JOIN competitions co ON co.id = cs.competition_id
       WHERE t.club_id = ? AND co.tier IS NOT NULL ORDER BY s.start_year DESC`,
      clubId
    )
    const season = (year ? seasons.find((s) => s.start_year === year) : undefined) ?? seasons[0]
    const teamRow = season
      ? this.get(`SELECT ${teamCols('t', '')}, t.competition_season_id FROM teams t ${teamJoins('t', '')} WHERE t.id = ?`, season.team_id)
      : undefined
    const csId = teamRow?.competition_season_id as number | undefined
    const stats = csId ? this.playerStats(csId, season!.team_id) : []
    const competition = csId
      ? this.get<{ code: string; name: string }>(
          'SELECT co.code, co.name FROM competition_seasons cs JOIN competitions co ON co.id = cs.competition_id WHERE cs.id = ?',
          csId
        )
      : undefined
    const leagueTeams = csId ? this.teamStats(csId) : []
    // Puesto en cada estadística (menos es mejor en pérdidas, faltas y puntos recibidos).
    const ranks: Record<string, number> = {}
    const lowerIsBetter = new Set(['tpg', 'pfpg', 'opp_ppg'])
    const mine = leagueTeams.find((t) => t.team.team_id === season?.team_id)
    if (mine) {
      const keys = ['ppg', 'opp_ppg', 'diff_pg', 'rpg', 'orpg', 'drpg', 'apg', 'spg', 'bpg', 'tpg', 'pfpg', 'pirpg', 'fg2_pct', 'fg3_pct', 'ft_pct', 'ts_pct', 'efg_pct', 'attendance_avg'] as const
      for (const key of keys) {
        const v = (t: TeamStatRow) => Number(t[key] ?? -Infinity)
        const better = leagueTeams.filter((t) => (lowerIsBetter.has(key) ? v(t) < v(mine) : v(t) > v(mine))).length
        ranks[key] = better + 1
      }
    }

    const roster = season
      ? this.all<RosterRow>(
          `SELECT p.id AS player_id, pr.ref AS player_ref, ${DISPLAY_NAME} AS display_name, p.photo_url AS photo,
                  p.photo_nobg_url AS photo_nobg, r.jersey_number, r.position, r.position_code, r.license_type,
                  p.nationality, p.height_cm, p.birth_date, r.is_active
           FROM roster_entries r JOIN players p ON p.id = r.player_id
           JOIN v_player_ref pr ON pr.player_id = p.id
           WHERE r.team_id = ?
           ORDER BY r.is_active DESC, CAST(r.jersey_number AS INTEGER)`,
          season.team_id
        ).map((r) => {
          const s = stats.find((x) => x.player_id === r.player_id)
          return { ...r, games: s?.games ?? 0, mpg: s?.mpg ?? null, ppg: s?.ppg ?? null, rpg: s?.rpg ?? null, apg: s?.apg ?? null, pirpg: s?.pirpg ?? null }
        })
      : []

    const honours: ClubHonour[] = this.all<ClubHonour>(
      `SELECT competition, season_start_year, label,
              CASE WHEN champion_club_id = ? THEN 'champion' ELSE 'runner_up' END AS role,
              CASE WHEN champion_club_id = ? THEN runner_up_name ELSE champion_name END AS opponent, result
       FROM honours WHERE champion_club_id = ? OR runner_up_club_id = ?
       ORDER BY season_start_year DESC`,
      clubId,
      clubId,
      clubId,
      clubId
    )
    const records = Object.fromEntries(
      this.alltime()
        .filter((r) => r.club_ref === ref)
        .map((r) => [r.scope, r])
    ) as ClubData['records']

    const info: ClubInfo = {
      club_id: clubId,
      ref,
      name: c.name,
      short_name: c.short_name,
      abbr: c.abbreviation,
      logo: c.logo_url ?? teamRow?.logo ?? null,
      color: c.primary_color ?? teamRow?.color ?? null,
      color2: c.secondary_color ?? null,
      founded_year: c.founded_year,
      city: c.city,
      arena: c.arena,
      arena_address: c.arena_address,
      arena_capacity: c.arena_capacity,
      arena_photo_url: c.arena_photo_url,
      website: c.website,
      president: c.president,
      socials: json(c.socials, {}),
      history: c.history,
      history_url: c.history_url,
      parent: c.parent_club_id
        ? (this.get(
            `SELECT pc.name, cr.ref, pc.logo_url AS logo FROM clubs pc JOIN v_club_ref cr ON cr.club_id = pc.id WHERE pc.id = ?`,
            c.parent_club_id
          ) as ClubInfo['parent'])
        : null,
      // Filiales y vinculados, con la liga de su última temporada.
      filiales: this.all(
        `SELECT fc.name, cr.ref, fc.logo_url AS logo,
                (SELECT co.name || ' ' || se.label FROM teams t JOIN competition_seasons cs ON cs.id = t.competition_season_id
                   JOIN competitions co ON co.id = cs.competition_id JOIN seasons se ON se.id = cs.season_id
                 WHERE t.club_id = fc.id AND co.tier IS NOT NULL ORDER BY se.start_year DESC LIMIT 1) AS league
         FROM clubs fc JOIN v_club_ref cr ON cr.club_id = fc.id WHERE fc.parent_club_id = ? ORDER BY fc.name`,
        clubId
      ) as ClubInfo['filiales']
    }
    const standing = csId ? this.standings(csId).find((s) => s.team_id === season!.team_id) : undefined
    const pick = (k: 'ppg' | 'rpg' | 'apg' | 'pirpg') => this.leadersFrom(stats, k, 1)[0]
    return {
      club: info,
      competition,
      ranks,
      teamsInLeague: leagueTeams.length,
      seasons,
      season: season && { start_year: season.start_year, label: season.label },
      team: teamRow ? team(teamRow) : undefined,
      roster,
      staff: season
        ? this.all<{ name: string; role: string }>(
            `SELECT c.full_name AS name, s.role FROM team_staff s JOIN coaches c ON c.id = s.coach_id
             WHERE s.team_id = ? ORDER BY s.role DESC, c.full_name`,
            season.team_id
          )
        : [],
      games: season
        ? this.all(
            `${GAME_SELECT} WHERE g.home_team_id = ? OR g.away_team_id = ? ORDER BY g.scheduled_at IS NULL, g.scheduled_at`,
            season.team_id,
            season.team_id
          ).map(toGame)
        : [],
      stats: mine,
      playerStats: stats,
      standing,
      leaders: { ppg: pick('ppg'), rpg: pick('rpg'), apg: pick('apg'), pirpg: pick('pirpg') },
      honours,
      records
    }
  }

  players(): PlayerIndexRow[] {
    const ids = this.currentEditionIds()
    if (!ids.length) return []
    const stats = new Map(ids.flatMap((id) => this.playerStats(id)).map((s) => [`${s.player_id}:${s.team.team_id}`, s]))
    return this.all(
      `SELECT p.id AS player_id, pr.ref AS player_ref, ${DISPLAY_NAME} AS display_name, p.photo_url AS photo,
              p.photo_nobg_url AS photo_nobg, COALESCE(r.position, p.position) AS position,
              COALESCE(r.position_code, p.position_code) AS position_code, p.nationality, p.height_cm, p.birth_date,
              r.jersey_number, ${teamCols('t', '')}, co.code AS competition_code
       FROM roster_entries r JOIN players p ON p.id = r.player_id JOIN v_player_ref pr ON pr.player_id = p.id
       JOIN teams t ON t.id = r.team_id ${teamJoins('t', '')}
       JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN competitions co ON co.id = cs.competition_id
       WHERE t.competition_season_id IN (${ids.map(() => '?').join(',')}) AND r.is_active = 1
       ORDER BY display_name`,
      ...ids
    ).map((r) => {
      const s = stats.get(`${r.player_id}:${r.team_id}`)
      return {
        competition_code: r.competition_code,
        player_ref: r.player_ref,
        display_name: r.display_name,
        photo: r.photo,
        photo_nobg: r.photo_nobg,
        position: r.position,
        position_code: r.position_code,
        nationality: r.nationality,
        height_cm: r.height_cm,
        birth_date: r.birth_date,
        jersey_number: r.jersey_number,
        team: team(r),
        games: s?.games ?? 0,
        ppg: s?.ppg ?? null,
        rpg: s?.rpg ?? null,
        apg: s?.apg ?? null,
        pirpg: s?.pirpg ?? null
      }
    })
  }

  private playerIdByRef(ref: string): number | undefined {
    return this.get<{ player_id: number }>('SELECT player_id FROM v_player_ref WHERE ref = ?', ref)?.player_id
  }

  player(ref: string): PlayerData | null {
    const id = this.playerIdByRef(ref)
    if (id == null) return null
    const p = this.get(`SELECT p.*, ${DISPLAY_NAME} AS display_name FROM players p WHERE p.id = ?`, id)!

    const current = this.get(
      `SELECT ${teamCols('t', '')}, r.jersey_number, r.license_type, r.is_active, s.label AS season_label, t.competition_season_id,
              co.code AS competition_code, co.name AS competition_name
       FROM roster_entries r JOIN teams t ON t.id = r.team_id ${teamJoins('t', '')}
       JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN seasons s ON s.id = cs.season_id
       JOIN competitions co ON co.id = cs.competition_id
       WHERE r.player_id = ? ORDER BY s.start_year DESC, r.is_active DESC LIMIT 1`,
      id
    )
    // Una sola consulta de la liga: la línea del jugador y el resto para su puesto.
    const leagueStats = current ? this.playerStats(current.competition_season_id) : []
    const season = current ? leagueStats.find((s) => s.player_id === id && s.team.team_id === current.team_id) : undefined
    const ranks = season ? leagueRanks(leagueStats, season) : {}

    // Trayectoria: temporadas con boxscores propios + temporadas pasadas agregadas desde acb.com.
    const fromBox = this.all(
      `SELECT se.start_year, se.label, co.code AS competition_code, t.name AS team_name, cr.ref AS club_ref,
              COALESCE(t.logo_url, c.logo_url) AS logo, pc.name AS parent_name, pcr.ref AS parent_ref, ${SUM_COLS},
              SUM(CASE WHEN rd.phase = 'playoff' THEN 1 ELSE 0 END) AS playoff_games,
              SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                         OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins
       FROM player_game_stats s JOIN games g ON g.id = s.game_id LEFT JOIN rounds rd ON rd.id = g.round_id
       JOIN teams t ON t.id = s.team_id JOIN clubs c ON c.id = t.club_id JOIN v_club_ref cr ON cr.club_id = c.id
       LEFT JOIN clubs pc ON pc.id = c.parent_club_id LEFT JOIN v_club_ref pcr ON pcr.club_id = pc.id
       JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN seasons se ON se.id = cs.season_id
       JOIN competitions co ON co.id = cs.competition_id
       WHERE s.player_id = ? AND s.period = 0 AND s.seconds > 0
       GROUP BY t.id`,
      id
    ).map((r) => ({ ...withRates(r), section: sectionOf(r.competition_code, r.parent_name), source: 'boxscores' }) as TrajectoryRow)
    const fromLines = this.all(
      `SELECT l.season_start_year AS start_year, l.competition_code, l.team_name, cr.ref AS club_ref, c.logo_url AS logo,
              l.games, l.playoff_games, l.wins, l.seconds, l.points AS pts, l.reb, l.oreb, l.dreb, l.ast, l.stl, l.blk,
              l.tov, l.pf, l.fouls_drawn AS fd, l.pir, l.plus_minus AS pm, l.dunks, l.fg2m, l.fg2a, l.fg3m, l.fg3a, l.ftm, l.fta
       FROM player_season_lines l LEFT JOIN clubs c ON c.id = l.club_id LEFT JOIN v_club_ref cr ON cr.club_id = l.club_id
       WHERE l.player_id = ?`,
      id
    ).map(
      (r) =>
        ({
          ...withRates(r),
          label: `${r.start_year}-${String(r.start_year + 1).slice(-2)}`,
          parent_name: null,
          parent_ref: null,
          section: sectionOf(r.competition_code, null),
          source: 'acb'
        }) as TrajectoryRow
    )
    // Por temporada y liga gana la fuente más completa: los boxscores propios pueden estar
    // incompletos si esa temporada histórica aún no se ha descargado entera.
    const games = (rows: TrajectoryRow[], key: string) =>
      rows.filter((r) => `${r.competition_code}:${r.start_year}` === key).reduce((n, r) => n + r.games, 0)
    const keys = new Set([...fromBox, ...fromLines].map((r) => `${r.competition_code}:${r.start_year}`))
    const trajectory = [...keys]
      .flatMap((k) => (games(fromLines, k) > games(fromBox, k) ? fromLines : fromBox).filter((r) => `${r.competition_code}:${r.start_year}` === k))
      .sort((a, b) => b.start_year - a.start_year)

    const gameLog = this.all(
      `SELECT g.id AS game_id, gr.ref AS game_ref, g.scheduled_at, (g.home_team_id = s.team_id) AS is_home,
              CASE WHEN g.home_team_id = s.team_id THEN g.home_score ELSE g.away_score END AS team_score,
              CASE WHEN g.home_team_id = s.team_id THEN g.away_score ELSE g.home_score END AS opp_score,
              s.is_starter, s.seconds, s.points, s.fg2m, s.fg2a, s.fg3m, s.fg3a, s.ftm, s.fta, s.reb, s.ast, s.stl,
              s.blk, s.tov, s.pf, s.plus_minus, s.pir, ${teamCols('o', '')},
              co.code AS competition_code, co.name AS competition_name, se.label AS season_label, mt.name AS team_name,
              pc.name AS parent_name
       FROM player_game_stats s JOIN games g ON g.id = s.game_id
       JOIN teams mt ON mt.id = s.team_id JOIN clubs mc ON mc.id = mt.club_id LEFT JOIN clubs pc ON pc.id = mc.parent_club_id
       JOIN competition_seasons cs ON cs.id = g.competition_season_id JOIN seasons se ON se.id = cs.season_id
       JOIN competitions co ON co.id = cs.competition_id
       JOIN teams o ON o.id = CASE WHEN g.home_team_id = s.team_id THEN g.away_team_id ELSE g.home_team_id END
       ${teamJoins('o', '')}
       LEFT JOIN v_game_ref gr ON gr.game_id = g.id
       WHERE s.player_id = ? AND s.period = 0
       ORDER BY g.scheduled_at DESC LIMIT 500`,
      id
    ).map((r) => ({ ...r, section: sectionOf(r.competition_code, r.parent_name), opponent: team(r) }) as unknown as PlayerGameLog)

    const acbRef = this.get<{ external_id: string }>(
      `SELECT external_id FROM external_ids WHERE entity_type = 'player' AND entity_id = ? AND source = 'acb'`,
      id
    )?.external_id
    return {
      ranks,
      player: {
        id,
        ref,
        display_name: p.display_name,
        full_name: p.full_name,
        first_name: p.first_name,
        last_name: p.last_name,
        birth_date: p.birth_date,
        birth_place: p.birth_place,
        birth_country: p.birth_country,
        nationality: p.nationality,
        height_cm: p.height_cm,
        position: p.position,
        position_code: p.position_code,
        photo: p.photo_url,
        photo_nobg: p.photo_nobg_url,
        body_photo: p.body_photo_url,
        socials: json(p.socials, {}),
        acb_url: acbRef ? `https://acb.com/es/liga/jugadores/jugador-${acbRef}` : null
      },
      current: current
        ? {
            ...team(current),
            jersey_number: current.jersey_number,
            season_label: current.season_label,
            license_type: current.license_type,
            is_active: current.is_active,
            competition_code: current.competition_code,
            competition_name: current.competition_name
          }
        : undefined,
      stints: this.all(
        `SELECT season_start_year, competition, club_name, team_name, license, joined_on, left_on
         FROM player_stints WHERE player_id = ? ORDER BY season_start_year DESC, joined_on DESC`,
        id
      ).map((st) => ({ ...st, label: `${st.season_start_year}-${String(st.season_start_year + 1).slice(-2)}` }) as PlayerData['stints'][number]),
      season,
      career: json<PlayerCareer | undefined>(p.career, undefined),
      trajectory,
      gameLog,
      reports: this.reports(id)
    }
  }

  game(ref: string): GameDetail | null {
    const row = this.get(`${GAME_SELECT.replace('SELECT g.id,', 'SELECT g.id, g.referees, s.label AS season_label, co.code AS competition_code, co.name AS competition_name,')}
       JOIN competition_seasons cs ON cs.id = g.competition_season_id JOIN seasons s ON s.id = cs.season_id
       JOIN competitions co ON co.id = cs.competition_id
       WHERE gr.ref = ?`, ref)
    if (!row) return null
    const g = toGame(row)
    const periods = this.all<GameDetail['periods'][number]>(
      'SELECT period, home_points, away_points FROM game_period_scores WHERE game_id = ? ORDER BY period',
      g.id
    )
    const teams = [g.home, g.away].map((t) => {
      const lines = this.all<GameDetail['teams'][number]['lines'][number]>(
        `SELECT p.id AS player_id, pr.ref AS player_ref, ${DISPLAY_NAME} AS display_name, s.jersey_number, s.is_starter,
                s.seconds, s.points, s.fg2m, s.fg2a, s.fg3m, s.fg3a, s.ftm, s.fta, s.oreb, s.dreb, s.reb, s.ast, s.stl,
                s.tov, s.blk, s.pf, s.plus_minus, s.pir
         FROM player_game_stats s JOIN players p ON p.id = s.player_id JOIN v_player_ref pr ON pr.player_id = p.id
         WHERE s.game_id = ? AND s.team_id = ? AND s.period = 0
         ORDER BY s.is_starter DESC, s.seconds DESC`,
        g.id,
        t.team_id
      )
      const total = this.get(
        `SELECT points, fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, pf, pir, head_coach
         FROM team_game_stats WHERE game_id = ? AND team_id = ? AND period = 0`,
        g.id,
        t.team_id
      )
      return { team: t, is_home: t.team_id === g.home.team_id ? 1 : 0, head_coach: total?.head_coach ?? null, lines, total: total ?? {} }
    })
    return {
      game: {
        ...g,
        referees: json(row.referees, []),
        season_label: row.season_label,
        competition_code: row.competition_code,
        competition_name: row.competition_name
      },
      periods,
      teams
    }
  }

  search(q: string): SearchResult[] {
    const text = q.trim()
    if (text.length < 2) return []
    const term = `%${text}%`
    const clubs = this.all<SearchResult>(
      `SELECT 'club' AS kind, cr.ref, c.name, c.arena AS detail, c.logo_url AS image
       FROM clubs c JOIN v_club_ref cr ON cr.club_id = c.id
       WHERE (c.name LIKE ? OR c.short_name LIKE ?) AND EXISTS (SELECT 1 FROM teams t WHERE t.club_id = c.id)
       ORDER BY c.name LIMIT 6`,
      term,
      term
    )
    const players = this.all<SearchResult>(
      `SELECT 'player' AS kind, pr.ref, ${DISPLAY_NAME} AS name, COALESCE(p.photo_nobg_url, p.photo_url) AS image,
              (SELECT t.name FROM roster_entries r JOIN teams t ON t.id = r.team_id
               WHERE r.player_id = p.id ORDER BY t.competition_season_id DESC, r.is_active DESC LIMIT 1) AS detail
       FROM players p JOIN v_player_ref pr ON pr.player_id = p.id
       WHERE p.full_name LIKE ? OR p.known_as LIKE ?
       ORDER BY name LIMIT 12`,
      term,
      term
    )
    return [...clubs, ...players]
  }

  // ───────────────────────── Scouting ─────────────────────────
  reports(playerId?: number): ScoutingReport[] {
    const rows = this.all<ScoutingReport>(
      `SELECT r.*, ${DISPLAY_NAME} AS player_name, pr.ref AS player_ref, COALESCE(p.photo_nobg_url, p.photo_url) AS player_photo
       FROM scouting_reports r JOIN players p ON p.id = r.player_id JOIN v_player_ref pr ON pr.player_id = p.id
       ${playerId ? 'WHERE r.player_id = ?' : ''} ORDER BY r.updated_at DESC`,
      ...(playerId ? [playerId] : [])
    )
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
