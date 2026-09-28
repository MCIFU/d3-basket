/**
 * Parsers de las páginas públicas de acb.com / live.acb.com.
 *
 * Estrategia anti-fragilidad: no dependemos de rutas fijas dentro del payload,
 * sino de la "forma" de los objetos (claves que deben estar presentes). Si ACB
 * reordena componentes, los datos siguen encontrándose; si cambia los nombres
 * de las claves, el parser lanza un ParseError claro en vez de guardar basura.
 */
import { RscDocument, findAllInDoc, findObjects, isElement, textContent } from '../core/rsc'
import type {
  GameStatus,
  NBoxscore,
  NCalendar,
  NCoach,
  NEdition,
  NPlayer,
  NPlayerLine,
  NRoster,
  NRosterEntry,
  NRound,
  NStatLine,
  NTeam,
  NTeamBoxscore,
  NTeamScheduleRow,
  PositionCode
} from '../types'
import { acbUrls } from './urls'

export class ParseError extends Error {
  constructor(page: string, detail: string) {
    super(`[acb:${page}] ${detail} — puede que la web haya cambiado de estructura`)
    this.name = 'ParseError'
  }
}

type Obj = Record<string, any>

/** Texto limpio: sin espacios sobrantes (la ACB a veces manda "Nombre  Apellido"). */
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== ''
    ? v.trim().replace(/\s+/g, ' ')
    : typeof v === 'number'
      ? String(v)
      : undefined
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const optNum = (v: unknown): number | undefined =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)

// ───────────────────────── Normalizadores comunes ─────────────────────────

const POSITION_CODES: Record<string, PositionCode> = {
  base: 'PG',
  escolta: 'SG',
  alero: 'SF',
  'ala-pivot': 'PF',
  'ala pivot': 'PF',
  pivot: 'C'
}

export function positionCode(position?: string): PositionCode | undefined {
  if (!position) return undefined
  const key = position
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  return POSITION_CODES[key]
}

export function mapStatus(status: unknown): GameStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'FINALIZED':
    case 'FINISHED':
      return 'finished'
    case 'STARTED':
    case 'LIVE':
    case 'PLAYING':
      return 'live'
    case 'POSTPONED':
      return 'postponed'
    case 'SUSPENDED':
      return 'suspended'
    case 'UNSCHEDULED':
    case 'NOT_SCHEDULED':
      return 'unscheduled'
    default:
      return 'scheduled'
  }
}

/** "15-11-1987" → "1987-11-15" */
export function parseDmy(v: unknown): string | undefined {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(String(v ?? '').trim())
  if (!m) return undefined
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** 196 → 196 ; "1,90" → 190 ; "2.05" → 205 */
export function parseHeightCm(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return v < 3 ? Math.round(v * 100) : Math.round(v)
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n < 3 ? Math.round(n * 100) : Math.round(n)
}

/** "21:02" → 1262 segundos */
export function parseClock(v: unknown): number {
  const m = /^(\d+):(\d{1,2})$/.exec(String(v ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export function mapTeam(t: Obj, slugs?: Map<string, string>): NTeam {
  if (!t || t.id == null || t.clubId == null) throw new ParseError('team', 'equipo sin id/clubId')
  const clubId = String(t.clubId)
  const slug = slugs?.get(clubId)
  return {
    ref: { source: 'acb', id: String(t.id) },
    clubRef: { source: 'acb', id: clubId, url: slug ? acbUrls.team(slug) : undefined },
    name: str(t.fullName) ?? str(t.shortName) ?? `Club ${clubId}`,
    shortName: str(t.shortName),
    abbreviation: str(t.abbreviatedName),
    primaryColor: str(t.primaryColorHex) ?? str(t.displayColor),
    textColor: str(t.displayTextColor) ?? str(t.textColorHex),
    logoUrl: str(t.logo),
    slug
  }
}

export function mapPlayer(p: Obj): NPlayer {
  if (!p || p.id == null) throw new ParseError('player', 'jugador sin id')
  const first = str(p.firstName)
  const last = str(p.lastName)
  const nick = str(p.nickname)
  const fullName = [first, last].filter(Boolean).join(' ') || nick || `Jugador ${p.id}`
  const position = str(p.gameRole)
  return {
    ref: { source: 'acb', id: String(p.id) },
    firstName: first,
    lastName: last,
    fullName,
    knownAs: nick && nick.toLowerCase() !== fullName.toLowerCase() ? nick : undefined,
    position,
    positionCode: positionCode(position),
    photoUrl: str(p.headshotImageUrl)
  }
}

/** Mapa clubId → slug a partir de los enlaces /es/liga/equipos/<slug>-<clubId>. */
export function extractTeamSlugs(html: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of html.matchAll(/\/es\/liga\/equipos\/([a-z0-9-]+?)-(\d+)(?=[/?"#])/g)) {
    map.set(m[2], `${m[1]}-${m[2]}`)
  }
  return map
}

// ───────────────────────── Ediciones (temporadas) ─────────────────────────

/** Lista de ediciones de la Liga Endesa (competitionId 1) presente en fichas de equipo/jugador. */
export function parseEditions(doc: RscDocument, competitionId = 1): NEdition[] {
  const comps = findAllInDoc<Obj>(
    doc,
    (o) => o.id === competitionId && Array.isArray(o.editions) && o.editions.length > 0
  )
  const out = new Map<string, NEdition>()
  for (const c of comps) {
    for (const e of c.editions as Obj[]) {
      const start = optNum(e.startYear ?? e.seasonStartYear)
      if (e.id == null || !start) continue
      out.set(String(e.id), {
        ref: { source: 'acb', id: String(e.id) },
        competition: 'ACB',
        startYear: start,
        name: `Liga Endesa ${str(e.displayName) ?? `${start}-${String(start + 1).slice(-2)}`}`
      })
    }
  }
  return [...out.values()].sort((a, b) => b.startYear - a.startYear)
}

// ───────────────────────── Calendario (temporada actual) ─────────────────────────

export function parseCalendar(html: string): NCalendar {
  const doc = RscDocument.fromHtml(html)
  if (doc.size === 0) throw new ParseError('calendario', 'no se encontró payload RSC')

  const container = findAllInDoc<Obj>(
    doc,
    (o) => Array.isArray(o.rounds) && Array.isArray(o.teams) && o.rounds.some((r: Obj) => Array.isArray(r?.matches))
  )[0]
  if (!container) throw new ParseError('calendario', 'no se encontraron jornadas/equipos')

  const slugs = extractTeamSlugs(html)
  const teams = (container.teams as Obj[]).map((t) => mapTeam(t, slugs))
  const byTeamId = new Map(teams.map((t) => [t.ref.id, t]))

  const current = findAllInDoc<Obj>(doc, (o) => 'currentEditionId' in o)[0]
  const editionId = str(current?.currentEditionId)
  if (!editionId) throw new ParseError('calendario', 'no se encontró currentEditionId')

  const games: NCalendar['games'] = []
  let startYear: number | undefined
  for (const r of container.rounds as Obj[]) {
    // Las eliminatorias llegan como jornadas con `subphase` ({ id, subphaseNumber }).
    const round: NRound = {
      phase: r.subphase ? 'playoff' : 'regular',
      number: num(r.roundNumber),
      name: r.subphase ? `Playoff · ronda ${r.subphase.subphaseNumber ?? r.roundNumber}` : `Jornada ${r.roundNumber}`,
      ref: { source: 'acb', id: String(r.id) }
    }
    for (const m of (r.matches ?? []) as Obj[]) {
      const home = byTeamId.get(String(m.homeTeam?.id))
      const away = byTeamId.get(String(m.awayTeam?.id))
      if (!home || !away) throw new ParseError('calendario', `partido ${m.id} sin equipos resolubles`)
      startYear ??= optNum(m.seasonStartYear)
      const status = mapStatus(m.matchStatus)
      games.push({
        ref: { source: 'acb', id: String(m.id), url: acbUrls.game(String(m.id)) },
        round,
        homeTeam: home,
        awayTeam: away,
        scheduledAt: status === 'unscheduled' ? undefined : str(m.startDateTime),
        status,
        homeScore: status === 'scheduled' || status === 'unscheduled' ? undefined : optNum(m.homeTeamScore),
        awayScore: status === 'scheduled' || status === 'unscheduled' ? undefined : optNum(m.awayTeamScore)
      })
    }
  }
  if (!startYear) throw new ParseError('calendario', 'no se pudo determinar la temporada')

  return {
    edition: {
      ref: { source: 'acb', id: editionId },
      competition: 'ACB',
      startYear,
      name: `Liga Endesa ${startYear}-${String(startYear + 1).slice(-2)}`,
      isCurrent: true
    },
    teams,
    games
  }
}

// ───────────────────────── Plantilla ─────────────────────────

export function parseRoster(html: string): NRoster & { editions: NEdition[] } {
  const doc = RscDocument.fromHtml(html)
  const holder = findAllInDoc<Obj>(doc, (o) => o.currentRoster && Array.isArray(o.currentRoster.players))[0]
  if (!holder) throw new ParseError('plantilla', 'no se encontró currentRoster')
  const roster = holder.currentRoster as Obj

  const toEntry = (e: Obj, isActive: boolean): NRosterEntry => {
    const player = mapPlayer(e.player)
    player.nationality = str(e.nationalityCountry)
    player.heightCm = parseHeightCm(e.height)
    return {
      player,
      jerseyNumber: str(e.player?.shirtNumber),
      position: player.position,
      positionCode: player.positionCode,
      licenseType: str(e.licensing),
      isActive
    }
  }

  const players = [
    ...(roster.players as Obj[]).map((e) => toEntry(e, e.isLicenseActive !== false)),
    ...((roster.playerAbsences ?? []) as Obj[]).filter((e) => e?.player).map((e) => toEntry(e, false))
  ]

  const staff: NCoach[] = ((roster.staff ?? []) as Obj[])
    .filter((s) => s?.coach?.id != null)
    .map((s) => {
      const c = s.coach as Obj
      const role = String(c.gameRole ?? '').toLowerCase()
      return {
        ref: { source: 'acb', id: String(c.id) },
        firstName: str(c.firstName),
        lastName: str(c.lastName),
        fullName: [str(c.firstName), str(c.lastName)].filter(Boolean).join(' ') || `Entrenador ${c.id}`,
        photoUrl: str(c.headshotImageUrl),
        role: role.includes('ayudante') ? 'assistant_coach' : role.includes('entrenador') ? 'head_coach' : 'other'
      }
    })

  return { players, staff, editions: parseEditions(doc) }
}

// ───────────────────────── Ficha de jugador ─────────────────────────

export function parsePlayerProfile(html: string): NPlayer {
  const doc = RscDocument.fromHtml(html)
  const data = findAllInDoc<Obj>(doc, (o) => o.player && typeof o.player === 'object' && 'birthDate' in o)[0]
  if (!data) throw new ParseError('jugador', 'no se encontró playerData')
  const player = mapPlayer(data.player)
  return {
    ...player,
    birthDate: parseDmy(data.birthDate),
    birthPlace: str(data.birthPlace),
    birthCountry: str(data.birthCountry),
    nationality: str(data.nationality),
    heightCm: parseHeightCm(data.height)
  }
}

// ───────────────────────── Boxscore ─────────────────────────

function mapStatLine(s: Obj): NStatLine {
  return {
    seconds: parseClock(s.playTime),
    points: num(s.points),
    fg2m: num(s.twoPointersMade),
    fg2a: num(s.twoPointersAttempted),
    fg3m: num(s.threePointersMade),
    fg3a: num(s.threePointersAttempted),
    ftm: num(s.freeThrowsMade),
    fta: num(s.freeThrowsAttempted),
    oreb: num(s.offRebounds),
    dreb: num(s.defRebounds),
    reb: num(s.totalRebounds),
    ast: num(s.assists),
    stl: num(s.steals),
    tov: num(s.turnovers),
    blk: num(s.blocks),
    blkAgainst: num(s.receivedBlocks),
    dunks: num(s.dunks),
    pf: num(s.personalFouls),
    foulsDrawn: num(s.foulsDrawn),
    plusMinus: optNum(s.plusMinus),
    pir: optNum(s.rating)
  }
}

export function parseBoxscore(html: string, gameId: string): NBoxscore {
  const doc = RscDocument.fromHtml(html)
  const header = findAllInDoc<Obj>(doc, (o) => 'currentHomeScore' in o && o.teams?.home && o.teams?.away)[0]
  if (!header) throw new ParseError('boxscore', `partido ${gameId}: no se encontró la cabecera`)
  const stats = findAllInDoc<Obj>(doc, (o) => Array.isArray(o.teamBoxscores))[0]

  const homeTeam = mapTeam(header.teams.home)
  const awayTeam = mapTeam(header.teams.away)
  const status = mapStatus(header.status)
  const hasScore = status !== 'scheduled' && status !== 'unscheduled'

  const teams: NTeamBoxscore[] = ((stats?.teamBoxscores ?? []) as Obj[]).map((tb) => {
    const team = mapTeam(tb.team)
    const periods = ((tb.statsByPeriods ?? []) as Obj[]).map((p) => {
      const players: NPlayerLine[] = ((p.stats?.players ?? []) as Obj[])
        .filter((l) => l?.player?.id != null)
        .map((l) => ({
          ...mapStatLine(l),
          player: mapPlayer(l.player),
          jerseyNumber: str(l.player.shirtNumber),
          isStarter: !!l.isStarted
        }))
      const t = (p.stats?.team ?? {}) as Obj
      return {
        period: num(p.quarter),
        players,
        total: mapStatLine(p.stats?.total ?? {}),
        teamOnly: { oreb: num(t.offRebounds), dreb: num(t.defRebounds), tov: num(t.turnovers) }
      }
    })
    return {
      team,
      isHome: team.ref.id === homeTeam.ref.id,
      headCoach: str(tb.headCoach),
      assistantCoaches: ((tb.assistantCoaches ?? []) as unknown[]).map(str).filter(Boolean) as string[],
      periods
    }
  })

  return {
    gameRef: { source: 'acb', id: String(header.matchId ?? gameId), url: acbUrls.game(gameId) },
    scheduledAt: str(header.start),
    status,
    homeTeam,
    awayTeam,
    homeScore: hasScore ? optNum(header.currentHomeScore) : undefined,
    awayScore: hasScore ? optNum(header.currentAwayScore) : undefined,
    periodScores: ((header.quarterScores ?? []) as Obj[]).map((q) => ({
      period: num(q.quarter),
      home: num(q.home),
      away: num(q.away)
    })),
    arena: str(stats?.arena),
    attendance: optNum(stats?.attendance),
    referees: ((stats?.referees ?? []) as unknown[]).map(str).filter(Boolean) as string[],
    teams
  }
}

// ───────────────────────── Partidos de un equipo (histórico) ─────────────────────────

/**
 * Página /es/liga/equipos/<slug>/partidos?editionId=N. Es la única vista pública
 * que respeta editionId para temporadas pasadas, así que la usamos para el histórico.
 */
export function parseTeamSchedule(html: string): NTeamScheduleRow[] {
  const doc = RscDocument.fromHtml(html)
  const rows = findAllInDoc<Obj>(doc, (o) => isElement(o) && o.type === 'tr' && /^\d{4,}$/.test(String(o.key)))
  if (rows.length === 0 && doc.size === 0) throw new ParseError('partidos-equipo', 'no se encontró payload RSC')

  const cellText = (row: Obj, cls: string): string => {
    const td = findObjects<Obj>(row, (o) => isElement(o) && o.type === 'td' && String(o.props.className ?? '').includes(cls))[0]
    return td ? textContent(td).trim() : ''
  }

  return rows.map((row) => {
    const gameId = String(row.key)
    const jornada = cellText(row, 'jornadaCell')
    const fase = cellText(row, 'faseCell').toLowerCase()
    const date = findObjects<Obj>(row, (o) => typeof o.dateString === 'string')[0]?.dateString as string | undefined
    const isPlayoff = fase.includes('playoff')
    const roundNumber = parseInt(jornada, 10)
    const round: NRound | undefined = isPlayoff
      ? { phase: 'playoff', number: 0, name: 'Playoff' }
      : Number.isFinite(roundNumber)
        ? { phase: 'regular', number: roundNumber, name: `Jornada ${roundNumber}` }
        : undefined
    return { gameRef: { source: 'acb', id: gameId, url: acbUrls.game(gameId) }, round, scheduledAt: date }
  })
}
