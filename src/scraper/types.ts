/**
 * Modelo normalizado que produce cada adaptador de liga (ACB, FEB...).
 * El repositorio solo conoce estos tipos, así añadir LEB Oro / LEB Plata
 * consiste en escribir un adaptador nuevo que devuelva lo mismo.
 */

export type SourceName = 'acb' | 'feb' | 'euroleague' | 'fiba' | 'lba' | 'lnp' | 'bbl' | 'proa' | 'lnb' | 'esake'
export type CompetitionCode = 'ACB' | 'LEB_ORO' | 'LEB_PLATA' | 'TERCERA_FEB' | 'COPA_ESPANA' | 'CESA_INF_M' | 'CESA_INF_F' | 'CESA_CAD_M' | 'CESA_CAD_F' | 'CE_JUN_M' | 'CE_JUN_F' | 'CE_CAD_M' | 'CE_CAD_F' | 'CE_INF_M' | 'CE_INF_F' | 'EUROLEAGUE' | 'EUROCUP' | 'BCL' | 'LBA' | 'ITA_A2' | 'BBL' | 'PROA' | 'LNB_ELITE' | 'LNB_ELITE2' | 'GBL'

export interface SourceRef {
  source: SourceName
  id: string
  url?: string
}

export type GameStatus = 'scheduled' | 'unscheduled' | 'live' | 'finished' | 'postponed' | 'suspended'
export type PositionCode = 'PG' | 'SG' | 'SF' | 'PF' | 'C'

export interface NEdition {
  ref: SourceRef
  competition: CompetitionCode
  startYear: number
  name?: string
  isCurrent?: boolean
}

export interface NTeam {
  ref: SourceRef // id del equipo en esa edición
  clubRef: SourceRef // id estable del club
  name: string
  shortName?: string
  abbreviation?: string
  primaryColor?: string
  textColor?: string
  logoUrl?: string
  slug?: string
  /** Grupo dentro de la liga regular (p. ej. 'A' en la Segunda FEB), si la competición se divide. */
  group?: string
}

export interface NPlayer {
  ref: SourceRef
  firstName?: string
  lastName?: string
  fullName: string
  knownAs?: string
  birthDate?: string
  birthPlace?: string
  birthCountry?: string
  nationality?: string
  heightCm?: number
  position?: string
  positionCode?: PositionCode
  photoUrl?: string
  /** Cara con fondo transparente. */
  photoNobgUrl?: string
  /** Cuerpo entero con fondo transparente. */
  bodyPhotoUrl?: string
}

/** Datos del club publicados junto a la plantilla. */
export interface NClubInfo {
  clubRef: SourceRef
  foundedYear?: number
  arena?: string
  arenaAddress?: string
  arenaCapacity?: number
  arenaPhotoUrl?: string
  website?: string
  president?: string
  logoUrl?: string
  primaryColor?: string
  socials: Record<string, string>
}

/** Línea de estadística de carrera (totales o medias) tal como la publica la fuente. */
export interface NCareerLine {
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

export interface NCareerRecord {
  value: number
  date?: string
  home?: string
  away?: string
  gameRef?: string
}

export interface NPlayerCareer {
  acbTotals?: NCareerLine
  acbAverages?: NCareerLine
  allTotals?: NCareerLine
  allAverages?: NCareerLine
  records: Record<string, NCareerRecord>
}

export interface NPlayerProfile extends NPlayer {
  editions: string[] // ids de edición de la Liga Endesa en las que ha jugado
  career: NPlayerCareer
  socials: Record<string, string>
}

/** Etapa de la trayectoria de un jugador (una licencia en un club y temporada). */
export interface NStint {
  seasonStartYear: number
  competition: string // 'PRIMERA FEB', 'LIGA EBA', 'LIGA ENDESA'...
  club: string
  team?: string
  license?: string
  joinedOn?: string
  leftOn?: string
}

/** Partido de la página "partidos" de un jugador en una temporada. */
export interface NPlayerGameRow extends NStatLine {
  gameRef: string
  date?: string
  roundType?: string // 'LR' liga regular, 'PO' playoff...
  team: { clubId: string; teamId: string; name: string; abbreviation?: string }
  opponent: { clubId: string; name: string }
  isHome: boolean
  won: boolean
}

/** Fila de la clasificación histórica / cuadro de honor. */
export interface NClubRecord {
  clubRef: SourceRef
  name: string
  abbreviation?: string
  logoUrl?: string
  position?: number
  seasons?: number
  games?: number
  wins?: number
  losses?: number
  ties?: number
  pointsFor?: number
  pointsAgainst?: number
  bestMargin?: number
  worstMargin?: number
  firstPlaces?: number
  secondPlaces?: number
  thirdPlaces?: number
  fourthPlaces?: number
}

export interface NRosterEntry {
  player: NPlayer
  jerseyNumber?: string
  position?: string
  positionCode?: PositionCode
  licenseType?: string
  isActive: boolean
}

export interface NCoach {
  ref: SourceRef
  firstName?: string
  lastName?: string
  fullName: string
  photoUrl?: string
  role: 'head_coach' | 'assistant_coach' | 'other'
}

export interface NRoster {
  players: NRosterEntry[]
  staff: NCoach[]
}

export interface NRound {
  phase: string // 'regular' | 'playoff' | ...
  number: number
  name?: string
  ref?: SourceRef
}

export interface NGame {
  ref: SourceRef
  round?: NRound
  homeTeam: NTeam
  awayTeam: NTeam
  scheduledAt?: string
  status: GameStatus
  homeScore?: number
  awayScore?: number
}

export interface NCalendar {
  edition: NEdition
  teams: NTeam[]
  games: NGame[]
}

export interface NStatLine {
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
  blkAgainst: number
  dunks: number
  pf: number
  foulsDrawn: number
  plusMinus?: number
  pir?: number
}

export interface NPlayerLine extends NStatLine {
  player: NPlayer
  jerseyNumber?: string
  isStarter: boolean
}

export interface NTeamPeriod {
  period: number // 0 = partido completo
  players: NPlayerLine[]
  total: NStatLine
  teamOnly: { oreb: number; dreb: number; tov: number }
}

export interface NTeamBoxscore {
  team: NTeam
  isHome: boolean
  headCoach?: string
  assistantCoaches: string[]
  periods: NTeamPeriod[]
}

export interface NBoxscore {
  gameRef: SourceRef
  scheduledAt?: string
  status: GameStatus
  homeTeam: NTeam
  awayTeam: NTeam
  homeScore?: number
  awayScore?: number
  periodScores: { period: number; home: number; away: number }[]
  arena?: string
  attendance?: number
  referees: string[]
  teams: NTeamBoxscore[]
}

/** Partido listado en la página de partidos de un equipo (histórico). */
export interface NTeamScheduleRow {
  gameRef: SourceRef
  round?: NRound
  scheduledAt?: string
}
