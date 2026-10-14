/**
 * EuroLeague y EuroCup desde la API pública de Euroleague Basketball:
 *   api-live.euroleague.net/v2  calendario, clubes y plantillas (con fecha de nacimiento y foto)
 *   live.euroleague.net/api     boxscore de cada partido
 * Los clubes españoles se enlazan con su ficha de la ACB y los jugadores se unen con los ya
 * conocidos por fecha de nacimiento y apellido (Writer.upsertPlayer).
 */
import type { DB } from '../../db/database'
import { Writer } from '../../db/writer'
import type { HttpClient } from '../core/http'
import type { AcbSyncOptions, SyncSummary } from '../acb/sync'
import { currentSeasonStart } from '../feb/sync'
import type { GameStatus, NBoxscore, NGame, NPlayer, NStatLine, NTeam, NTeamBoxscore, PositionCode } from '../types'

export const EURO_COMPETITIONS = {
  EUROLEAGUE: { code: 'E', name: 'EuroLeague' },
  EUROCUP: { code: 'U', name: 'EuroCup' }
} as const
export type EuroCompetition = keyof typeof EURO_COMPETITIONS

const API = 'https://api-live.euroleague.net/v2'
const LIVE = 'https://live.euroleague.net/api'

/** Clubes españoles: código de Euroleague → ref de su ficha ACB. */
const SPANISH: Record<string, string> = { MAD: '9', BAR: '2', BAS: '3', PAM: '13', MAN: '10', TNF: '28', BGS: '549', MAL: '14', CAN: '5', JOV: '8', BIL: '4' }

interface ApiClub { code: string; name: string; abbreviatedName?: string; editorialName?: string; tvCode?: string; images?: { crest?: string }; country?: { code: string }; city?: string; website?: string; president?: string }
interface ApiGame {
  gameCode: number
  round: number
  roundName?: string
  phaseType?: { code: string; name: string }
  group?: { name?: string; rawName?: string }
  played: boolean
  utcDate?: string
  date?: string
  local: { club: ApiClub; score: number }
  road: { club: ApiClub; score: number }
  venue?: { name?: string }
  audience?: number
}
interface ApiPerson {
  person: { code: string; name: string; country?: { name: string }; height?: number; birthDate?: string; birthCountry?: { name: string }; images?: { headshot?: string } }
  images?: { headshot?: string; action?: string }
  dorsal?: string
  position?: number
  positionName?: string
  active?: boolean
  club: ApiClub
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
/** 'LLULL, SERGIO' → { first: 'Sergio', last: 'Llull' } */
function splitName(raw: string) {
  const [last, first] = raw.split(',').map((x) => title(x.trim()))
  return { first: first ?? '', last: last ?? '', full: [first, last].filter(Boolean).join(' ') }
}
const POS: Record<number, PositionCode> = { 1: 'PG', 2: 'SF', 3: 'C' }
const POS_NAME: Record<number, string> = { 1: 'Base', 2: 'Alero', 3: 'Pívot' }
const PHASE: Record<string, string> = { RS: 'regular', PI: 'playin', PO: 'playoff', FF: 'final_four', TS: 'regular', EF: 'playoff', QF: 'playoff', SF: 'playoff', F: 'playoff' }
const secs = (m: string | null | undefined) => {
  if (!m || !/\d/.test(m)) return 0
  const [a, b] = m.split(':').map(Number)
  return a * 60 + (b || 0)
}

export class EuroleagueScraper {
  private w: Writer
  private groups = new Map<string, string>()
  constructor(
    private readonly db: DB,
    private readonly http: HttpClient
  ) {
    this.w = new Writer(db)
  }

  private async json<T>(url: string): Promise<T> {
    const body = (await this.http.get(url)).body
    const d = JSON.parse(body)
    return (d && typeof d === 'object' && 'data' in d ? d.data : d) as T
  }

  private team(c: ApiClub, season: string): NTeam {
    return {
      ref: { source: 'euroleague', id: `${season}:${c.code}` },
      clubRef: { source: 'euroleague', id: c.code },
      name: c.editorialName && c.name.length > 28 ? c.name : c.name,
      shortName: c.abbreviatedName ?? c.editorialName,
      abbreviation: c.tvCode ?? c.code,
      logoUrl: c.images?.crest,
      group: this.groups.get(c.code)
    }
  }

  /** Enlaza los clubes españoles con su ficha de la ACB antes de crear nada. */
  private linkSpanish(clubs: ApiClub[]) {
    for (const c of clubs) {
      const ref = SPANISH[c.code]
      if (!ref || this.w.findId('club', { source: 'euroleague', id: c.code }) != null) continue
      const row = this.db.prepare('SELECT club_id FROM v_club_ref WHERE ref = ?').get(ref) as { club_id: number } | undefined
      if (row) this.w.link('club', row.club_id, { source: 'euroleague', id: c.code })
    }
  }

  async sync(competition: EuroCompetition, opts: AcbSyncOptions & { season?: number } = {}): Promise<SyncSummary> {
    const log = opts.log ?? (() => {})
    const { code, name } = EURO_COMPETITIONS[competition]
    const startYear = opts.season ?? currentSeasonStart()
    const season = `${code}${startYear}`
    const label = `${name} ${startYear}-${String(startYear + 1).slice(-2)}`
    const runId = this.w.startRun('euroleague', `${competition}:${startYear}`)
    const summary: SyncSummary = { edition: label, competitionSeasonId: 0, teams: 0, games: 0, rosters: 0, players: 0, playerBios: 0, boxscores: 0, careerSeasons: 0, history: false, requests: 0, errors: [] }

    log(`▶ ${label}: clubes y calendario`)
    const clubs = await this.json<ApiClub[]>(`${API}/competitions/${code}/seasons/${season}/clubs`)
    const games = await this.json<ApiGame[]>(`${API}/competitions/${code}/seasons/${season}/games`)
    this.linkSpanish(clubs)
    // Fase regular por grupos (EuroCup): grupo de cada club.
    const groupOf = new Map<string, string>()
    for (const g of games) {
      const raw = g.phaseType?.code === 'RS' ? (g.group?.name ?? '') : ''
      const m = /group\s+([A-Z])\b/i.exec(raw)
      if (m) (groupOf.set(g.local.club.code, m[1].toUpperCase()), groupOf.set(g.road.club.code, m[1].toUpperCase()))
    }
    this.groups = groupOf
    const csId = this.w.transaction(() => {
      const csId = this.w.upsertEdition({ ref: { source: 'euroleague', id: season }, competition, startYear, name: label, isCurrent: startYear === currentSeasonStart() })
      const ids = new Map<string, number>()
      for (const c of clubs) {
        ids.set(c.code, this.w.upsertTeam(csId, this.team(c, season)))
        const clubId = this.w.findId('club', { source: 'euroleague', id: c.code })!
        // Datos del club (solo si faltan: los clubes españoles conservan los de la ACB/FEB).
        this.db
          .prepare(
            `UPDATE clubs SET country = COALESCE(NULLIF(country, 'ES'), ?), city = COALESCE(city, ?), website = COALESCE(website, ?),
               president = COALESCE(president, ?) WHERE id = ? AND ? != 'ESP'`
          )
          .run(c.country?.code ?? null, c.city ? title(c.city) : null, c.website ?? null, c.president ?? null, clubId, c.country?.code ?? '')
      }
      for (const g of games) {
        const home = ids.get(g.local.club.code) ?? this.w.upsertTeam(csId, this.team(g.local.club, season))
        const away = ids.get(g.road.club.code) ?? this.w.upsertTeam(csId, this.team(g.road.club, season))
        this.w.upsertGame(csId, this.game(g, season), home, away)
      }
      this.w.refreshRoundDates(csId)
      return csId
    })
    summary.competitionSeasonId = csId
    summary.teams = clubs.length
    summary.games = games.length
    log(`  ${clubs.length} clubes, ${games.length} partidos (${games.filter((g) => g.played).length} jugados)`)

    if (opts.rosters !== false) {
      log('▶ Plantillas')
      const people = await this.json<ApiPerson[]>(`${API}/competitions/${code}/seasons/${season}/people?personType=J`)
      this.w.transaction(() => {
        const seen = new Map<number, number[]>()
        for (const p of people) {
          const teamId = this.w.findId('team', { source: 'euroleague', id: `${season}:${p.club.code}` })
          if (teamId == null) continue
          const player = this.player(p)
          const playerId = this.w.upsertPlayer(player, { bio: true, fillOnly: true })
          this.w.upsertRosterEntry(teamId, playerId, { jerseyNumber: p.dorsal || undefined, position: player.position, positionCode: player.positionCode, isActive: p.active !== false })
          seen.set(teamId, [...(seen.get(teamId) ?? []), playerId])
        }
        summary.rosters = seen.size
      })
    }

    if (opts.boxscores !== false) {
      const pending = this.db
        .prepare(
          `SELECT x.external_id AS id FROM games g JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'euroleague'
           WHERE g.competition_season_id = ? AND g.status = 'finished' ${opts.force ? '' : 'AND g.boxscore_synced_at IS NULL'} ORDER BY g.scheduled_at`
        )
        .all(csId) as { id: string }[]
      const byCode = new Map(games.map((g) => [`${season}_${g.gameCode}`, g]))
      log(`▶ Boxscores (${pending.length} pendientes)`)
      for (const { id } of pending.slice(0, opts.maxBoxscores ?? pending.length)) {
        const g = byCode.get(id)
        if (!g) continue
        const url = `${LIVE}/Boxscore?gamecode=${g.gameCode}&seasoncode=${season}`
        try {
          const box = this.boxscore(JSON.parse((await this.http.get(url)).body), g, season)
          const game = this.game(g, season)
          this.w.saveBoxscore(csId, box, { round: game.round })
          summary.boxscores++
        } catch (err) {
          summary.errors.push({ url, error: String(err) })
        }
      }
    }

    summary.players = (this.db.prepare('SELECT COUNT(DISTINCT r.player_id) AS n FROM roster_entries r JOIN teams t ON t.id = r.team_id WHERE t.competition_season_id = ?').get(csId) as { n: number }).n
    this.w.touchEdition(csId)
    summary.requests = this.http.requests
    this.w.finishRun(runId, { csId, status: summary.errors.length ? 'partial' : 'ok', requests: summary.requests, summary: { ...summary, errors: undefined }, errors: summary.errors })
    return summary
  }

  private game(g: ApiGame, season: string): NGame {
    const phase = PHASE[g.phaseType?.code ?? 'RS'] ?? 'regular'
    const status: GameStatus = g.played ? 'finished' : 'scheduled'
    return {
      ref: { source: 'euroleague', id: `${season}_${g.gameCode}` },
      round: { phase, number: g.round, name: phase === 'regular' ? `Jornada ${g.round}` : (g.phaseType?.name ?? g.roundName) },
      homeTeam: this.team(g.local.club, season),
      awayTeam: this.team(g.road.club, season),
      scheduledAt: g.utcDate ?? g.date,
      status,
      homeScore: g.played ? g.local.score : undefined,
      awayScore: g.played ? g.road.score : undefined
    }
  }

  private player(p: ApiPerson): NPlayer {
    const n = splitName(p.person.name)
    const photo = p.images?.headshot ?? p.person.images?.headshot
    return {
      ref: { source: 'euroleague', id: p.person.code.trim() },
      firstName: n.first,
      lastName: n.last,
      fullName: n.full,
      birthDate: p.person.birthDate?.slice(0, 10),
      birthCountry: p.person.birthCountry?.name,
      nationality: p.person.country?.name,
      heightCm: p.person.height || undefined,
      position: p.position ? POS_NAME[p.position] : p.positionName,
      positionCode: p.position ? POS[p.position] : undefined,
      photoUrl: photo
    }
  }

  private boxscore(d: any, g: ApiGame, season: string): NBoxscore {
    const line = (s: any): NStatLine => ({
      seconds: secs(s.Minutes),
      points: s.Points ?? 0,
      fg2m: s.FieldGoalsMade2 ?? 0,
      fg2a: s.FieldGoalsAttempted2 ?? 0,
      fg3m: s.FieldGoalsMade3 ?? 0,
      fg3a: s.FieldGoalsAttempted3 ?? 0,
      ftm: s.FreeThrowsMade ?? 0,
      fta: s.FreeThrowsAttempted ?? 0,
      oreb: s.OffensiveRebounds ?? 0,
      dreb: s.DefensiveRebounds ?? 0,
      reb: s.TotalRebounds ?? 0,
      ast: s.Assistances ?? 0,
      stl: s.Steals ?? 0,
      tov: s.Turnovers ?? 0,
      blk: s.BlocksFavour ?? 0,
      blkAgainst: s.BlocksAgainst ?? 0,
      dunks: 0,
      pf: s.FoulsCommited ?? 0,
      foulsDrawn: s.FoulsReceived ?? 0,
      plusMinus: s.Plusminus ?? undefined,
      pir: s.Valuation ?? undefined
    })
    const sides = [this.team(g.local.club, season), this.team(g.road.club, season)]
    const teams: NTeamBoxscore[] = (d.Stats ?? []).slice(0, 2).map((t: any, i: number) => ({
      team: sides[i],
      isHome: i === 0,
      headCoach: t.Coach ? splitName(t.Coach).full : undefined,
      assistantCoaches: [],
      periods: [
        {
          period: 0,
          players: (t.PlayersStats ?? [])
            .filter((p: any) => p.Player_ID?.trim())
            .map((p: any) => {
              const n = splitName(p.Player)
              return {
                ...line(p),
                player: { ref: { source: 'euroleague', id: p.Player_ID.trim().replace(/^P/, '') }, firstName: n.first, lastName: n.last, fullName: n.full },
                jerseyNumber: p.Dorsal || undefined,
                isStarter: !!p.IsStarter
              }
            }),
          total: line(t.totr ?? {}),
          teamOnly: { oreb: t.tmr?.OffensiveRebounds ?? 0, dreb: t.tmr?.DefensiveRebounds ?? 0, tov: t.tmr?.Turnovers ?? 0 }
        }
      ]
    }))
    const q = d.ByQuarter ?? []
    const periodScores = q.length === 2 ? [1, 2, 3, 4].map((n) => ({ period: n, home: q[0][`Quarter${n}`] ?? 0, away: q[1][`Quarter${n}`] ?? 0 })) : []
    return {
      gameRef: { source: 'euroleague', id: `${season}_${g.gameCode}` },
      scheduledAt: g.utcDate ?? g.date,
      status: 'finished',
      homeTeam: sides[0],
      awayTeam: sides[1],
      homeScore: g.local.score,
      awayScore: g.road.score,
      periodScores,
      arena: g.venue?.name ? title(g.venue.name) : undefined,
      attendance: Number(d.Attendance) || g.audience || undefined,
      referees: String(d.Referees ?? '').split(/,\s*(?=[A-ZÁÉÍÓÚÑ]+,)/).map((r: string) => splitName(r).full).filter(Boolean),
      teams
    }
  }
}
