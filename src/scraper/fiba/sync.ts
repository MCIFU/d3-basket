/**
 * Basketball Champions League desde las fuentes oficiales de FIBA:
 *   digital-api.fiba.basketball/hapi  competiciones, calendario y plantillas (la API que usa la web
 *                                      championsleague.basketball, con su clave pública de cliente)
 *   championsleague.basketball/en/games/{id}  jugada a jugada oficial de cada partido
 * FIBA no publica el boxscore por jugador fuera de su web, así que se reconstruye a partir del
 * jugada a jugada (tiros, rebotes, asistencias, faltas, cambios para los minutos y el +/-).
 */
import type { DB } from '../../db/database'
import { Writer } from '../../db/writer'
import type { HttpClient } from '../core/http'
import type { AcbSyncOptions, SyncSummary } from '../acb/sync'
import { currentSeasonStart } from '../feb/sync'
import type { GameStatus, NBoxscore, NGame, NPlayer, NPlayerLine, NStatLine, NTeam, PositionCode } from '../types'

const API = 'https://digital-api.fiba.basketball/hapi'
const SITE = 'https://www.championsleague.basketball'
/** Clave pública que la web oficial envía en cada petición (NEXT_CLIENT_APIM_SUBSCRIPTION_KEY). */
const KEY = '898cd5e7389140028ecb42943c47eb74'
const BCL_MARKETING_ID = 112

/** Clubes españoles: organisationId de FIBA → ref de su ficha ACB. */
const SPANISH: Record<number, string> = {
  1012: '14',
  8579: '4',
  262: '8',
  10096: '12',
  358: '6',
  3906: '28',
  2426: '17',
  905: '10',
  57721: '549',
  9581: '25',
  2765: '5',
  251: '16'
}

interface ApiTeam {
  teamId: number
  organisationId: number
  code: string
  officialName: string
  shortName: string
}
interface ApiGame {
  gameId: number
  statusCode: string
  teamA: ApiTeam | null
  teamB: ApiTeam | null
  teamAScore: number | null
  teamBScore: number | null
  currentPeriodStatus?: string
  liveGameStatus?: number
  gameDateTimeUTC?: string
  venueName?: string
  spectators?: number
  groupPairingCode?: string
  round: {
    roundCode: string
    roundName: string
    roundNumber: number
    roundType: string
    roundOrder: number
  }
}
interface ApiRosterPlayer {
  personId: number
  firstName: string
  lastName: string
  dateOfBirth?: string
  uniformNumber?: string
  position?: string
  heightInCm?: number
  nationality?: string
  isOnFinalRoster?: boolean
}
interface PbpItem {
  ac: string
  txt: string
  Time: string
  SA: number
  SB: number
  oId: number | string
  pId: number | string
  made?: boolean
  pts?: number
  in?: string
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
const POS: Record<string, PositionCode> = {
  'Point Guard': 'PG',
  'Shooting Guard': 'SG',
  'Small Forward': 'SF',
  'Power Forward': 'PF',
  Center: 'C',
  Guard: 'SG',
  Forward: 'SF'
}
const POS_NAME: Record<PositionCode, string> = {
  PG: 'Base',
  SG: 'Escolta',
  SF: 'Alero',
  PF: 'Ala-pívot',
  C: 'Pívot'
}
const PHASE: Record<string, string> = {
  RS: 'regular',
  'Play-ins': 'playin',
  QF: 'playoff',
  SF: 'final_four',
  F: 'final_four',
  '3PG': 'final_four'
}
const finished = (g: ApiGame) => g.teamAScore != null && g.teamBScore != null && (g.currentPeriodStatus === 'E' || g.liveGameStatus === 999)

/** Extrae un objeto JSON de la carga RSC de Next.js a partir de una clave (`"playByPlay":{...}`). */
export function extractRscObject(html: string, key: string, firstField?: string): any {
  const text = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]) as string).join('')
  const at = text.indexOf(`"${key}":{${firstField ? `"${firstField}"` : ''}`)
  if (at < 0) return undefined
  let i = text.indexOf('{', at)
  const start = i
  let depth = 0
  let inStr = false
  for (; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1))
  }
  return undefined
}

const zero = (): NStatLine => ({
  seconds: 0,
  points: 0,
  fg2m: 0,
  fg2a: 0,
  fg3m: 0,
  fg3a: 0,
  ftm: 0,
  fta: 0,
  oreb: 0,
  dreb: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  tov: 0,
  blk: 0,
  blkAgainst: 0,
  dunks: 0,
  pf: 0,
  foulsDrawn: 0,
  plusMinus: 0,
  pir: 0
})
const clock = (t: string) => {
  const [m, s] = t.split(':').map(Number)
  return m * 60 + (s || 0)
}

/**
 * Boxscore por jugador a partir del jugada a jugada. `periods` en orden (Q1..Q4, OT...).
 * Devuelve las líneas por organisationId → personId.
 */
export function boxFromPlayByPlay(periods: { name: string; items: PbpItem[] }[], orgA: number) {
  const lines = new Map<number, Map<number, NStatLine & { starter: boolean }>>()
  const team = {
    oreb: new Map<number, number>(),
    dreb: new Map<number, number>(),
    tov: new Map<number, number>()
  }
  const get = (org: number, pid: number) => {
    let t = lines.get(org)
    if (!t) lines.set(org, (t = new Map()))
    let l = t.get(pid)
    if (!l) t.set(pid, (l = { ...zero(), starter: false }))
    return l
  }
  const orgOf = new Map<number, number>()
  let prevEnd = new Set<number>()
  periods.forEach((p, idx) => {
    const len = /^Q/.test(p.name) ? 600 : 300
    const items = p.items.filter((x) => x.ac !== 'STARTG')
    for (const x of items) if (typeof x.pId === 'number' && typeof x.oId === 'number') orgOf.set(x.pId, x.oId)
    // Quién está en pista al empezar el periodo: el del final del anterior, corregido con el
    // primer cambio de cada jugador en este periodo (si primero sale, estaba; si primero entra, no).
    const start = new Set(prevEnd)
    const firstSub = new Map<number, string>()
    const actedBeforeSub = new Set<number>()
    for (const x of items) {
      if (typeof x.pId !== 'number') continue
      if (x.ac === 'SUBST') {
        if (!firstSub.has(x.pId)) firstSub.set(x.pId, x.in ?? (/out/i.test(x.txt) ? 'OUT' : 'IN'))
      } else if (!firstSub.has(x.pId)) actedBeforeSub.add(x.pId)
    }
    for (const [pid, dir] of firstSub) dir === 'OUT' ? start.add(pid) : start.delete(pid)
    for (const pid of actedBeforeSub) start.add(pid)
    if (idx === 0) for (const pid of start) get(orgOf.get(pid)!, pid).starter = true
    const court = new Set(start)
    const enteredAt = new Map<number, number>([...court].map((pid) => [pid, len]))
    let lastSA = 0
    let lastSB = 0
    if (idx > 0) {
      const before = periods[idx - 1].items.at(-1)
      if (before) ((lastSA = before.SA), (lastSB = before.SB))
    }
    const applyScore = (sa: number, sb: number) => {
      const dA = sa - lastSA
      const dB = sb - lastSB
      if (!dA && !dB) return
      for (const pid of court) {
        const org = orgOf.get(pid)
        if (org == null) continue
        get(org, pid).plusMinus! += org === orgA ? dA - dB : dB - dA
      }
      lastSA = sa
      lastSB = sb
    }
    for (const x of items) {
      if (typeof x.SA === 'number') applyScore(x.SA, x.SB)
      const org = typeof x.oId === 'number' ? x.oId : undefined
      if (x.ac === 'TREB' && org != null) {
        const m = /offensive/i.test(x.txt) ? team.oreb : team.dreb
        m.set(org, (m.get(org) ?? 0) + 1)
        continue
      }
      if (x.ac === 'TTO' && org != null) {
        team.tov.set(org, (team.tov.get(org) ?? 0) + 1)
        continue
      }
      if (typeof x.pId !== 'number' || org == null) continue
      const l = get(org, x.pId)
      const made = x.made ?? /\bmade\b/i.test(x.txt)
      switch (x.ac) {
        case 'P2':
          l.fg2a++
          if (made) (l.fg2m++, (l.points += 2), /dunk/i.test(x.txt) && l.dunks++)
          break
        case 'P3':
          l.fg3a++
          if (made) (l.fg3m++, (l.points += 3))
          break
        case 'FT':
          l.fta++
          if (made) (l.ftm++, l.points++)
          break
        case 'REB':
          ;/offensive/i.test(x.txt) ? l.oreb++ : l.dreb++
          l.reb++
          break
        case 'ASS':
          l.ast++
          break
        case 'ST':
          l.stl++
          break
        case 'BS':
          l.blk++
          break
        case 'TO':
          l.tov++
          break
        case 'FOUL':
          l.pf++
          break
        case 'RFOUL':
          l.foulsDrawn++
          break
        case 'SUBST': {
          const t = clock(x.Time)
          const out = (x.in ?? (/out/i.test(x.txt) ? 'OUT' : 'IN')) === 'OUT'
          if (out && court.has(x.pId)) {
            l.seconds += (enteredAt.get(x.pId) ?? len) - t
            court.delete(x.pId)
          } else if (!out && !court.has(x.pId)) {
            court.add(x.pId)
            enteredAt.set(x.pId, t)
          }
          break
        }
      }
    }
    for (const pid of court) {
      const org = orgOf.get(pid)
      if (org != null) get(org, pid).seconds += enteredAt.get(pid) ?? len
    }
    prevEnd = court
  })
  for (const t of lines.values())
    for (const l of t.values()) {
      const missed = l.fg2a - l.fg2m + l.fg3a - l.fg3m + l.fta - l.ftm
      l.pir = l.points + l.reb + l.ast + l.stl + l.blk + l.foulsDrawn - missed - l.tov - l.pf - l.blkAgainst
    }
  return { lines, team }
}

export class FibaScraper {
  private w: Writer
  constructor(
    private readonly db: DB,
    private readonly http: HttpClient
  ) {
    this.w = new Writer(db)
  }

  private async api<T>(path: string): Promise<T> {
    return JSON.parse(
      (
        await this.http.get(`${API}/${path}`, {
          'Ocp-Apim-Subscription-Key': KEY,
          Accept: 'application/json'
        })
      ).body
    ) as T
  }

  private team(t: ApiTeam, startYear: number, group?: string): NTeam {
    return {
      ref: { source: 'fiba', id: `${startYear}:${t.organisationId}` },
      clubRef: { source: 'fiba', id: String(t.organisationId) },
      name: t.shortName || t.officialName,
      shortName: t.shortName,
      abbreviation: t.code,
      group
    }
  }

  private linkSpanish(teams: ApiTeam[]) {
    for (const t of teams) {
      const ref = SPANISH[t.organisationId]
      if (
        !ref ||
        this.w.findId('club', {
          source: 'fiba',
          id: String(t.organisationId)
        }) != null
      )
        continue
      const row = this.db.prepare('SELECT club_id FROM v_club_ref WHERE ref = ?').get(ref) as { club_id: number } | undefined
      if (row)
        this.w.link('club', row.club_id, {
          source: 'fiba',
          id: String(t.organisationId)
        })
    }
  }

  async sync(opts: AcbSyncOptions & { season?: number } = {}): Promise<SyncSummary> {
    const log = opts.log ?? (() => {})
    const startYear = opts.season ?? currentSeasonStart()
    const label = `Basketball Champions League ${startYear}-${String(startYear + 1).slice(-2)}`
    const runId = this.w.startRun('fiba', `BCL:${startYear}`)
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

    const comps = await this.api<{ competitionId: number; season: number }[]>(
      `getgdapcompetitionsbyseasonsandcompetitionmarketingname?competitionMarketingNameId=${BCL_MARKETING_ID}&fromSeason=${startYear + 1}&toSeason=${startYear + 1}`
    )
    const compId = comps[0]?.competitionId
    if (!compId) throw new Error(`FIBA no tiene la BCL ${startYear + 1}`)
    log(`▶ ${label} (competición FIBA ${compId}): calendario`)
    // La fase previa (eliminatorias de clasificación) no forma parte de la competición.
    const all = await this.api<ApiGame[]>(`getgdapgamesbycompetitionid?gdapCompetitionId=${compId}`)
    const games = all.filter((g) => g.teamA && g.teamB && ['VALID', 'INIT'].includes(g.statusCode) && !/^QR/.test(g.round.roundCode))
    const groupOf = new Map<number, string>()
    for (const g of games) if (g.round.roundCode === 'RS' && /^[A-Z]$/.test(g.groupPairingCode ?? '')) for (const t of [g.teamA!, g.teamB!]) groupOf.set(t.organisationId, g.groupPairingCode!)
    const teams = new Map<number, ApiTeam>()
    for (const g of games) for (const t of [g.teamA!, g.teamB!]) teams.set(t.organisationId, t)
    this.linkSpanish([...teams.values()])

    const roundNo = (g: ApiGame) => (g.round.roundCode === 'RS' ? Number(/-(\d+)$/.exec(String((g as any).gameName ?? ''))?.[1]) || g.round.roundNumber : g.round.roundOrder)
    const toGame = (g: ApiGame): NGame => {
      const phase = PHASE[g.round.roundCode] ?? 'playoff'
      const done = finished(g)
      const status: GameStatus = done ? 'finished' : 'scheduled'
      return {
        ref: { source: 'fiba', id: String(g.gameId) },
        round: {
          phase,
          number: roundNo(g),
          name: phase === 'regular' ? `Jornada ${roundNo(g)}` : g.round.roundName
        },
        homeTeam: this.team(g.teamA!, startYear, groupOf.get(g.teamA!.organisationId)),
        awayTeam: this.team(g.teamB!, startYear, groupOf.get(g.teamB!.organisationId)),
        scheduledAt: g.gameDateTimeUTC ? `${g.gameDateTimeUTC}Z` : undefined,
        status,
        homeScore: done ? g.teamAScore! : undefined,
        awayScore: done ? g.teamBScore! : undefined
      }
    }
    // Las jornadas de la fase de grupos van por número de partido dentro del grupo (A-1..A-12):
    // se agrupan por fecha, 2 partidos por grupo y jornada.
    const rsDates = [...new Set(games.filter((g) => g.round.roundCode === 'RS').map((g) => g.gameDateTimeUTC?.slice(0, 10) ?? ''))].sort()
    const week = (d: string) => Math.floor((Date.parse(d) - Date.parse(rsDates[0])) / (7 * 86400_000)) + 1
    const toGameW = (g: ApiGame) => {
      const n = toGame(g)
      if (g.round.roundCode === 'RS' && g.gameDateTimeUTC)
        n.round = {
          phase: 'regular',
          number: week(g.gameDateTimeUTC.slice(0, 10)),
          name: `Jornada ${week(g.gameDateTimeUTC.slice(0, 10))}`
        }
      return n
    }

    const csId = this.w.transaction(() => {
      const csId = this.w.upsertEdition({
        ref: { source: 'fiba', id: String(compId) },
        competition: 'BCL',
        startYear,
        name: label,
        isCurrent: startYear === currentSeasonStart()
      })
      const ids = new Map<number, number>()
      for (const t of teams.values()) ids.set(t.organisationId, this.w.upsertTeam(csId, this.team(t, startYear, groupOf.get(t.organisationId))))
      for (const g of games) this.w.upsertGame(csId, toGameW(g), ids.get(g.teamA!.organisationId)!, ids.get(g.teamB!.organisationId)!)
      this.w.refreshRoundDates(csId)
      return csId
    })
    summary.competitionSeasonId = csId
    summary.teams = teams.size
    summary.games = games.length
    log(`  ${teams.size} equipos, ${games.length} partidos (${games.filter(finished).length} jugados)`)

    // Plantillas: un equipo FIBA (teamId) por club y temporada.
    const teamIdOf = new Map<number, number>()
    for (const g of games) for (const t of [g.teamA!, g.teamB!]) teamIdOf.set(t.organisationId, t.teamId)
    if (opts.rosters !== false) {
      log('▶ Plantillas')
      for (const [org, fibaTeamId] of teamIdOf) {
        try {
          const r = await this.api<{ players: ApiRosterPlayer[] }>(`getgdapcompetitionteamrosterbyteamid?gdapTeamId=${fibaTeamId}`)
          const teamId = this.w.findId('team', {
            source: 'fiba',
            id: `${startYear}:${org}`
          })
          if (teamId == null) continue
          this.w.transaction(() => {
            for (const p of r.players ?? []) {
              const player = this.player(p)
              const playerId = this.w.upsertPlayer(player, {
                bio: true,
                fillOnly: true
              })
              this.w.upsertRosterEntry(teamId, playerId, {
                jerseyNumber: p.uniformNumber || undefined,
                position: player.position,
                positionCode: player.positionCode,
                isActive: p.isOnFinalRoster !== false
              })
            }
          })
          summary.rosters++
        } catch (err) {
          summary.errors.push({
            url: `roster ${fibaTeamId}`,
            error: String(err)
          })
        }
      }
    }

    // La web oficial solo publica el jugada a jugada de la temporada en curso.
    if (opts.boxscores !== false && startYear === currentSeasonStart()) {
      const pending = this.db
        .prepare(
          `SELECT x.external_id AS id FROM games g JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'fiba'
           WHERE g.competition_season_id = ? AND g.status = 'finished' ${opts.force ? '' : 'AND g.boxscore_synced_at IS NULL'} ORDER BY g.scheduled_at`
        )
        .all(csId) as { id: string }[]
      const byId = new Map(games.map((g) => [String(g.gameId), g]))
      log(`▶ Boxscores desde el jugada a jugada (${pending.length} pendientes)`)
      for (const { id } of pending.slice(0, opts.maxBoxscores ?? pending.length)) {
        const g = byId.get(id)
        if (!g) continue
        const url = `${SITE}/en/games/${g.gameId}-${g.teamA!.code}-${g.teamB!.code}`
        try {
          const html = (await this.http.get(url)).body
          const box = this.boxscore(html, g, toGameW(g))
          if (!box) throw new Error('sin jugada a jugada')
          this.w.saveBoxscore(csId, box, { round: toGameW(g).round })
          summary.boxscores++
        } catch (err) {
          summary.errors.push({ url, error: String(err) })
        }
      }
    }

    summary.players = (this.db.prepare('SELECT COUNT(DISTINCT r.player_id) AS n FROM roster_entries r JOIN teams t ON t.id = r.team_id WHERE t.competition_season_id = ?').get(csId) as { n: number }).n
    this.w.touchEdition(csId)
    summary.requests = this.http.requests
    this.w.finishRun(runId, {
      csId,
      status: summary.errors.length ? 'partial' : 'ok',
      requests: summary.requests,
      summary: { ...summary, errors: undefined },
      errors: summary.errors
    })
    return summary
  }

  private player(p: ApiRosterPlayer): NPlayer {
    const first = title(p.firstName ?? '')
    const last = title(p.lastName ?? '')
    const code = p.position ? POS[p.position] : undefined
    return {
      ref: { source: 'fiba', id: String(p.personId) },
      firstName: first,
      lastName: last,
      fullName: [first, last].filter(Boolean).join(' '),
      birthDate: p.dateOfBirth?.slice(0, 10),
      nationality: p.nationality,
      heightCm: p.heightInCm || undefined,
      position: code ? POS_NAME[code] : undefined,
      positionCode: code
    }
  }

  private boxscore(html: string, g: ApiGame, game: NGame): NBoxscore | undefined {
    const pbp = extractRscObject(html, 'playByPlay', 'items')
    if (!pbp?.items) return undefined
    const periods = Object.values(pbp.items as Record<string, { name: string; scoreA: number; scoreB: number; items: PbpItem[] }>)
    const { lines, team } = boxFromPlayByPlay(periods, g.teamA!.organisationId)
    const people = new Map<number, { firstName: string; lastName: string; uniformNumber?: string }>()
    for (const m of html.matchAll(/\\"personId\\":(\d+),\\"firstName\\":\\"((?:[^\\]|\\\\.)*?)\\",\\"lastName\\":\\"((?:[^\\]|\\\\.)*?)\\",\\"uniformNumber\\":\\"([^\\]*)\\"/g))
      people.set(Number(m[1]), {
        firstName: m[2],
        lastName: m[3],
        uniformNumber: m[4]
      })
    const sides: [ApiTeam, boolean][] = [
      [g.teamA!, true],
      [g.teamB!, false]
    ]
    const sum = (ls: NStatLine[]) => {
      const t = zero()
      for (const l of ls) for (const k of Object.keys(t) as (keyof NStatLine)[]) (t as any)[k] += (l as any)[k] ?? 0
      return t
    }
    return {
      gameRef: { source: 'fiba', id: String(g.gameId) },
      scheduledAt: game.scheduledAt,
      status: 'finished',
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: g.teamAScore!,
      awayScore: g.teamBScore!,
      periodScores: periods.map((p, i) => ({
        period: i + 1,
        home: p.scoreA,
        away: p.scoreB
      })),
      arena: g.venueName,
      attendance: g.spectators || undefined,
      referees: [],
      teams: sides.map(([t, isHome]) => {
        const players: NPlayerLine[] = [...(lines.get(t.organisationId) ?? new Map()).entries()].map(([pid, l]) => {
          const who = people.get(pid)
          const first = title(who?.firstName ?? '')
          const last = title(who?.lastName ?? '')
          const { starter, ...stat } = l
          return {
            ...stat,
            player: {
              ref: { source: 'fiba', id: String(pid) },
              firstName: first,
              lastName: last,
              fullName: [first, last].filter(Boolean).join(' ') || `#${pid}`
            },
            jerseyNumber: who?.uniformNumber,
            isStarter: starter
          }
        })
        const total = sum(players)
        total.oreb += team.oreb.get(t.organisationId) ?? 0
        total.dreb += team.dreb.get(t.organisationId) ?? 0
        total.reb = total.oreb + total.dreb
        total.tov += team.tov.get(t.organisationId) ?? 0
        return {
          team: isHome ? game.homeTeam : game.awayTeam,
          isHome,
          assistantCoaches: [],
          periods: [
            {
              period: 0,
              players,
              total,
              teamOnly: {
                oreb: team.oreb.get(t.organisationId) ?? 0,
                dreb: team.dreb.get(t.organisationId) ?? 0,
                tov: team.tov.get(t.organisationId) ?? 0
              }
            }
          ]
        }
      })
    }
  }
}
