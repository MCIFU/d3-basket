/**
 * Contrato entre los datos (SQLite en Electron o sql.js en la web) y la interfaz React.
 * Las páginas se identifican con referencias estables (ids de acb.com), así los
 * enlaces se pueden compartir y abrir en otra pestaña.
 */

// ───────────────────────── Filas básicas ─────────────────────────

export interface TeamLite {
  team_id: number
  club_ref: string
  name: string
  short_name: string | null
  abbr: string | null
  logo: string | null
  color: string | null
}

export interface EditionRow {
  id: number
  competition_code: string
  competition_name: string
  season_label: string
  start_year: number
  is_current: number
  last_synced_at: string | null
  teams: number
  games: number
  finished: number
}

export interface StandingRow extends TeamLite {
  /** Grupo en ligas divididas (Segunda FEB: 'A' / 'B'); null si hay grupo único. */
  group: string | null
  position: number
  played: number
  won: number
  lost: number
  points_for: number
  points_against: number
  diff: number
  form: ('W' | 'L')[] // últimos 5, del más antiguo al más reciente
}

export interface GameRow {
  id: number
  ref: string
  round_name: string | null
  round_number: number | null
  phase: string | null
  scheduled_at: string | null
  status: string
  home: TeamLite
  away: TeamLite
  home_score: number | null
  away_score: number | null
  has_boxscore: number
  attendance: number | null
  arena: string | null
  /** Grupo del equipo local en ligas divididas (Segunda y Tercera FEB). */
  group: string | null
}

/** Totales + medias + porcentajes (jugadores y equipos). */
export interface StatBlock {
  games: number
  seconds: number
  pts: number
  reb: number
  oreb: number
  dreb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
  fd: number
  pir: number
  pm: number
  dunks: number
  fg2m: number
  fg2a: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  // derivados
  mpg: number
  ppg: number
  rpg: number
  orpg: number
  drpg: number
  apg: number
  spg: number
  bpg: number
  tpg: number
  pfpg: number
  pirpg: number
  pmpg: number
  fg_pct: number | null
  fg2_pct: number | null
  fg3_pct: number | null
  ft_pct: number | null
  ts_pct: number | null
  efg_pct: number | null
}

export interface PlayerStatRow extends StatBlock {
  player_id: number
  player_ref: string
  display_name: string
  photo: string | null
  photo_nobg: string | null
  position: string | null
  nationality: string | null
  starts: number
  team: TeamLite
}

export interface TeamStatRow extends StatBlock {
  team: TeamLite
  wins: number
  losses: number
  opp_pts: number
  opp_ppg: number
  diff_pg: number
  home_games: number
  attendance_total: number
  attendance_avg: number | null
  attendance_max: number | null
}

export interface HonourRow {
  competition: 'liga' | 'copa' | 'supercopa'
  season_start_year: number
  label: string
  champion_name: string
  champion_ref: string | null
  champion_logo: string | null
  runner_up_name: string | null
  runner_up_ref: string | null
  runner_up_logo: string | null
  result: string | null
}

export interface ClubRecordRow {
  club_ref: string
  name: string
  logo: string | null
  scope: 'acb' | 'total'
  position: number | null
  seasons: number | null
  games: number | null
  wins: number | null
  losses: number | null
  points_for: number | null
  points_against: number | null
  best_margin: number | null
  worst_margin: number | null
  first_places: number | null
  second_places: number | null
  third_places: number | null
  fourth_places: number | null
  titles_liga: number
  titles_copa: number
  titles_supercopa: number
}

export interface LeaderRow {
  player_ref: string
  display_name: string
  photo_nobg: string | null
  photo: string | null
  team: TeamLite
  games: number
  value: number
}

// ───────────────────────── Páginas ─────────────────────────

export interface CompetitionInfo {
  code: string
  name: string
  short_name: string | null
  organizer: string
  tier: number | null
  editions: number
  current_label: string | null
}

export interface HomeData {
  competition: CompetitionInfo | undefined
  edition: EditionRow | undefined
  lastRound: { name: string; games: GameRow[] } | undefined
  nextRound: { name: string; games: GameRow[] } | undefined
  standings: StandingRow[]
  leaders: Record<'ppg' | 'rpg' | 'apg' | 'pirpg', LeaderRow[]>
  champions: HonourRow[] // último campeón de cada competición
  leagues: { code: string; name: string; short_name: string | null; edition: EditionRow | undefined }[]
  counts: { players: number; clubs: number; games: number; honours: number }
}

export interface LeagueData {
  competition: CompetitionInfo
  editions: EditionRow[]
  edition: EditionRow | undefined
  standings: StandingRow[]
  games: GameRow[]
  teamStats: TeamStatRow[]
  playerStats: PlayerStatRow[]
  honours: HonourRow[]
  alltime: ClubRecordRow[]
}

export interface ClubInfo {
  club_id: number
  ref: string
  name: string
  short_name: string | null
  abbr: string | null
  logo: string | null
  color: string | null
  /** Segundo color del club (del escudo). */
  color2: string | null
  founded_year: number | null
  /** Localidad (y provincia) del club. */
  city: string | null
  arena: string | null
  arena_address: string | null
  arena_capacity: number | null
  arena_photo_url: string | null
  website: string | null
  president: string | null
  socials: Record<string, string>
  history: string | null
  history_url: string | null
}

export interface RosterRow {
  player_id: number
  player_ref: string
  display_name: string
  photo: string | null
  photo_nobg: string | null
  jersey_number: string | null
  position: string | null
  position_code: string | null
  license_type: string | null
  nationality: string | null
  height_cm: number | null
  birth_date: string | null
  is_active: number
  games: number
  mpg: number | null
  ppg: number | null
  rpg: number | null
  apg: number | null
  pirpg: number | null
}

export interface ClubHonour {
  competition: HonourRow['competition']
  season_start_year: number
  label: string
  role: 'champion' | 'runner_up'
  opponent: string | null
  result: string | null
}

export interface ClubData {
  club: ClubInfo
  competition: { code: string; name: string } | undefined
  /** Puesto del equipo en cada estadística dentro de su liga (1 = mejor). */
  ranks: Record<string, number>
  teamsInLeague: number
  seasons: { start_year: number; label: string; competition_code: string; team_id: number; team_name: string }[]
  season: { start_year: number; label: string } | undefined
  team: TeamLite | undefined
  roster: RosterRow[]
  staff: { name: string; role: string }[]
  games: GameRow[]
  stats: TeamStatRow | undefined
  playerStats: PlayerStatRow[]
  standing: StandingRow | undefined
  leaders: Record<'ppg' | 'rpg' | 'apg' | 'pirpg', LeaderRow | undefined>
  honours: ClubHonour[]
  records: { acb?: ClubRecordRow; total?: ClubRecordRow }
}

export interface CareerLine {
  games: number
  starts?: number
  seconds: number
  points: number
  fg2m: number
  fg2a: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  tov: number
  blk: number
  dunks: number
  pf: number
  foulsDrawn: number
  pir: number
  plusMinus: number
}

export interface PlayerCareer {
  acbTotals?: CareerLine
  acbAverages?: CareerLine
  allTotals?: CareerLine
  allAverages?: CareerLine
  records: Record<string, { value: number; date?: string; home?: string; away?: string; gameRef?: string }>
}

export interface TrajectoryRow extends StatBlock {
  start_year: number
  label: string
  competition_code: string
  team_name: string
  club_ref: string | null
  logo: string | null
  playoff_games: number
  wins: number
  source: 'boxscores' | 'acb'
}

export interface PlayerGameLog {
  game_id: number
  game_ref: string
  scheduled_at: string | null
  opponent: TeamLite
  is_home: number
  team_score: number | null
  opp_score: number | null
  is_starter: number
  seconds: number
  points: number
  fg2m: number
  fg2a: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
  plus_minus: number | null
  pir: number | null
}

export interface PlayerInfo {
  id: number
  ref: string
  display_name: string
  full_name: string
  first_name: string | null
  last_name: string | null
  birth_date: string | null
  birth_place: string | null
  birth_country: string | null
  nationality: string | null
  height_cm: number | null
  position: string | null
  position_code: string | null
  photo: string | null
  photo_nobg: string | null
  body_photo: string | null
  socials: Record<string, string>
  acb_url: string | null
}

export interface StintRow {
  season_start_year: number
  label: string
  competition: string
  club_name: string
  team_name: string | null
  license: string | null
  joined_on: string | null
  left_on: string | null
}

export interface PlayerData {
  player: PlayerInfo
  current:
    | (TeamLite & {
        jersey_number: string | null
        season_label: string
        license_type: string | null
        is_active: number
        competition_code: string
        competition_name: string
      })
    | undefined
  /** Trayectoria completa por etapas (fuente FEB: todas las categorías). */
  stints: StintRow[]
  season: PlayerStatRow | undefined
  career: PlayerCareer | undefined
  trajectory: TrajectoryRow[]
  gameLog: PlayerGameLog[]
  reports: ScoutingReport[]
  /** Puesto en su liga esta temporada por estadística (clave de StatBlock → puesto y total). */
  ranks: Record<string, { rank: number; of: number }>
}

export interface PlayerIndexRow {
  competition_code: string
  player_ref: string
  display_name: string
  photo: string | null
  photo_nobg: string | null
  position: string | null
  position_code: string | null
  nationality: string | null
  height_cm: number | null
  birth_date: string | null
  jersey_number: string | null
  team: TeamLite
  games: number
  ppg: number | null
  rpg: number | null
  apg: number | null
  pirpg: number | null
}

export interface BoxLine {
  player_id: number
  player_ref: string
  display_name: string
  jersey_number: string | null
  is_starter: number
  seconds: number
  points: number
  fg2m: number
  fg2a: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  tov: number
  blk: number
  pf: number
  plus_minus: number | null
  pir: number | null
}

export interface GameDetail {
  game: GameRow & { referees: string[]; season_label: string; competition_code: string; competition_name: string }
  periods: { period: number; home_points: number; away_points: number }[]
  teams: {
    team: TeamLite
    is_home: number
    head_coach: string | null
    lines: BoxLine[]
    total: Partial<BoxLine>
  }[]
}

export interface ScoutingReport {
  id?: number
  player_id: number
  player_ref?: string
  season_id?: number | null
  team_id?: number | null
  author?: string | null
  report_date?: string
  role?: string | null
  archetype?: string | null
  strengths?: string | null
  weaknesses?: string | null
  offense_notes?: string | null
  defense_notes?: string | null
  physical_notes?: string | null
  intangibles?: string | null
  comparables?: string | null
  projection?: string | null
  current_level?: number | null
  potential?: number | null
  recommendation?: 'fichar' | 'seguir' | 'descartar' | null
  ratings?: { attribute: string; score: number; note?: string | null }[]
  player_name?: string
  player_photo?: string | null
  updated_at?: string
}

export interface SearchResult {
  kind: 'player' | 'club'
  ref: string
  name: string
  detail: string | null
  image: string | null
}

export interface SyncProgressEvent {
  stage: string
  done: number
  total: number
  message?: string
  log?: string
}

export interface D3Api {
  /** 'desktop' = Electron (SQLite local + scraper); 'web' = navegador (datos publicados, solo lectura). */
  platform: 'desktop' | 'web'
  dbInfo(): Promise<{ path: string; counts: Record<string, number>; updated_at: string | null }>
  home(): Promise<HomeData>
  league(code: string, year?: number): Promise<LeagueData | null>
  competitions(): Promise<CompetitionInfo[]>
  clubs(): Promise<(TeamLite & { arena: string | null; founded_year: number | null; competition_code: string; competition_name: string; group: string | null })[]>
  club(ref: string, year?: number): Promise<ClubData | null>
  players(): Promise<PlayerIndexRow[]>
  player(ref: string): Promise<PlayerData | null>
  game(ref: string): Promise<GameDetail | null>
  search(q: string): Promise<SearchResult[]>
  reports(): Promise<ScoutingReport[]>
  saveReport(r: ScoutingReport): Promise<number>
  deleteReport(id: number): Promise<void>
  /** Solo web: copia de seguridad de los informes guardados en el navegador. */
  exportReports?(): Promise<string>
  importReports?(json: string): Promise<number>
  /** Sincroniza una liga ('ACB' por defecto, o 'LEB_ORO' / 'LEB_PLATA' de la FEB). */
  syncAcb(opts: { season?: number; players?: boolean; league?: string }): Promise<{ ok: boolean; message: string }>
  onSyncProgress(cb: (e: SyncProgressEvent) => void): () => void
  openExternal(url: string): Promise<void>
}

export const SCOUTING_ATTRIBUTES = [
  'Tiro exterior',
  'Finalización',
  'Creación / bote',
  'Pase y visión',
  'Defensa exterior',
  'Defensa interior',
  'Rebote',
  'Atletismo',
  'IQ / lectura',
  'Carácter / intangibles'
] as const
