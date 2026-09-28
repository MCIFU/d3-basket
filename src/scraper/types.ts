/**
 * Modelo normalizado que produce cada adaptador de liga (ACB, FEB...).
 * El repositorio solo conoce estos tipos, así añadir LEB Oro / LEB Plata
 * consiste en escribir un adaptador nuevo que devuelva lo mismo.
 */

export type SourceName = 'acb' | 'feb'
export type CompetitionCode = 'ACB' | 'LEB_ORO' | 'LEB_PLATA'

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
