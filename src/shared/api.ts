/** Contrato entre el proceso principal (SQLite/scraper) y la interfaz React. */

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

export interface TeamRow {
  id: number
  club_id: number
  name: string
  short_name: string | null
  abbreviation: string | null
  primary_color: string | null
  text_color: string | null
  logo_url: string | null
  competition_season_id: number
  season_label: string
}

export interface StandingRow {
  team_id: number
  team_name: string
  logo_url: string | null
  played: number
  won: number
  lost: number
  points_for: number
  points_against: number
  diff: number
}

export interface RosterRow {
  player_id: number
  display_name: string
  jersey_number: string | null
  position: string | null
  position_code: string | null
  license_type: string | null
  nationality: string | null
  height_cm: number | null
  birth_date: string | null
  photo_url: string | null
  is_active: number
  games: number | null
  ppg: number | null
  rpg: number | null
  apg: number | null
  pir: number | null
}

export interface GameRow {
  id: number
  round_name: string | null
  round_number: number | null
  phase: string | null
  scheduled_at: string | null
  status: string
  home_team_id: number
  home_name: string
  home_abbr: string | null
  home_logo: string | null
  away_team_id: number
  away_name: string
  away_abbr: string | null
  away_logo: string | null
  home_score: number | null
  away_score: number | null
  has_boxscore: number
}

export interface BoxLine {
  player_id: number
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
  game: GameRow & {
    arena: string | null
    attendance: number | null
    referees: string[]
    season_label: string
  }
  periods: { period: number; home_points: number; away_points: number }[]
  teams: {
    team_id: number
    is_home: number
    name: string
    head_coach: string | null
    lines: BoxLine[]
    total: Omit<BoxLine, 'player_id' | 'display_name' | 'jersey_number' | 'is_starter' | 'seconds' | 'plus_minus'>
  }[]
}

export interface PlayerSeasonLine {
  team_id: number
  team_name: string
  season_label: string
  competition_code: string
  jersey_number: string | null
  is_active: number
  games: number | null
  mpg: number | null
  ppg: number | null
  rpg: number | null
  apg: number | null
  spg: number | null
  bpg: number | null
  pir: number | null
  fg2_pct: number | null
  fg3_pct: number | null
  ft_pct: number | null
  ts_pct: number | null
  efg_pct: number | null
}

export interface PlayerGameLog extends BoxLine {
  game_id: number
  scheduled_at: string | null
  opponent: string
  is_home: number
  team_score: number | null
  opp_score: number | null
}

export interface ScoutingReport {
  id?: number
  player_id: number
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
  updated_at?: string
}

export interface PlayerDetail {
  player: {
    id: number
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
    photo_url: string | null
    acb_url: string | null
  }
  seasons: PlayerSeasonLine[]
  gameLog: PlayerGameLog[]
  reports: ScoutingReport[]
}

export interface LeaderRow {
  player_id: number
  display_name: string
  team_name: string
  games: number
  value: number
}

export interface SearchResult {
  player_id: number
  display_name: string
  team_name: string | null
  season_label: string | null
  position: string | null
}

export interface SyncProgressEvent {
  stage: string
  done: number
  total: number
  message?: string
  log?: string
}

export interface D3Api {
  dbInfo(): Promise<{ path: string; counts: Record<string, number> }>
  editions(): Promise<EditionRow[]>
  standings(csId: number): Promise<StandingRow[]>
  teams(csId: number): Promise<TeamRow[]>
  team(teamId: number): Promise<{ team: TeamRow; roster: RosterRow[]; staff: { name: string; role: string }[]; games: GameRow[] }>
  games(csId: number): Promise<GameRow[]>
  game(gameId: number): Promise<GameDetail>
  player(playerId: number): Promise<PlayerDetail>
  leaders(csId: number, stat: LeaderStat): Promise<LeaderRow[]>
  search(q: string): Promise<SearchResult[]>
  reports(): Promise<ScoutingReport[]>
  saveReport(r: ScoutingReport): Promise<number>
  deleteReport(id: number): Promise<void>
  syncAcb(opts: { season?: number; players?: boolean }): Promise<{ ok: boolean; message: string }>
  onSyncProgress(cb: (e: SyncProgressEvent) => void): () => void
  openExternal(url: string): Promise<void>
}

export const LEADER_STATS = {
  ppg: 'Puntos',
  rpg: 'Rebotes',
  apg: 'Asistencias',
  spg: 'Robos',
  bpg: 'Tapones',
  pir: 'Valoración',
  ts_pct: 'True Shooting %'
} as const
export type LeaderStat = keyof typeof LEADER_STATS

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
