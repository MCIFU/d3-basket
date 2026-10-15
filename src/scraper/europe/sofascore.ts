/**
 * Ligas sin fuente oficial accesible (la Basketbol Süper Ligi turca: tbf.org.tr bloquea con
 * Cloudflare) desde la API pública de Sofascore: calendario, plantillas con fecha de nacimiento y
 * altura, boxscore por jugador (lineups) y escudos. Peticiones espaciadas: la API limita la tasa.
 */
import type { HttpClient } from '../core/http'
import type { CompetitionCode, GameStatus, NBoxscore, NGame, NPlayer, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, sumLines, zeroLine, type LeagueAdapter, type LeagueData } from './league'

const API = 'https://www.sofascore.com/api/v1'
const IMG = 'https://img.sofascore.com/api/v1'
const POS: Record<string, PositionCode> = { G: 'SG', PG: 'PG', SG: 'SG', F: 'SF', SF: 'SF', PF: 'PF', C: 'C' }

interface SsTeam { id: number; name: string; shortName?: string; nameCode?: string }
interface SsEvent { id: number; homeTeam: SsTeam; awayTeam: SsTeam; homeScore?: { current?: number }; awayScore?: { current?: number }; status: { type: string }; roundInfo?: { round?: number; name?: string }; startTimestamp: number }

export class SofascoreAdapter implements LeagueAdapter {
  source = 'sofascore' as const
  constructor(
    private readonly http: HttpClient,
    private readonly tournamentId: number,
    public readonly competition: CompetitionCode,
    public readonly name: string
  ) {}

  private async json<T>(path: string): Promise<T> {
    return JSON.parse((await this.http.get(`${API}${path}`, { Accept: 'application/json' })).body) as T
  }

  private team(t: SsTeam, startYear: number): NTeam {
    return { ref: { source: 'sofascore', id: `${startYear}:${t.id}` }, clubRef: { source: 'sofascore', id: String(t.id) }, name: t.name, shortName: t.shortName, abbreviation: t.nameCode, logoUrl: `${IMG}/team/${t.id}/image` }
  }

  private seasonId?: number
  async load(startYear: number): Promise<LeagueData> {
    const label = `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`
    const { seasons } = await this.json<{ seasons: { id: number; year: string }[] }>(`/unique-tournament/${this.tournamentId}/seasons`)
    this.seasonId = seasons.find((s) => s.year === label || s.year === `${startYear}/${startYear + 1}`)?.id
    if (!this.seasonId) throw new Error(`Sofascore no tiene la temporada ${label}`)
    const events: SsEvent[] = []
    for (const dir of ['last', 'next']) {
      for (let page = 0; page < 40; page++) {
        const d = await this.json<{ events: SsEvent[]; hasNextPage: boolean }>(`/unique-tournament/${this.tournamentId}/season/${this.seasonId}/events/${dir}/${page}`).catch(() => undefined)
        if (!d?.events?.length) break
        events.push(...d.events)
        if (!d.hasNextPage) break
      }
    }
    const teams = new Map<string, NTeam>()
    const games: NGame[] = []
    for (const e of new Map(events.map((e) => [e.id, e])).values()) {
      const home = this.team(e.homeTeam, startYear)
      const away = this.team(e.awayTeam, startYear)
      teams.set(home.ref.id, home)
      teams.set(away.ref.id, away)
      const finished = e.status.type === 'finished' && e.homeScore?.current != null
      const status: GameStatus = finished ? 'finished' : e.status.type === 'postponed' ? 'postponed' : 'scheduled'
      const round = e.roundInfo?.round ?? 0
      games.push({
        ref: { source: 'sofascore', id: String(e.id) },
        round: e.roundInfo?.name ? { phase: 'playoff', number: round, name: e.roundInfo.name } : { phase: 'regular', number: round, name: `Jornada ${round}` },
        homeTeam: home,
        awayTeam: away,
        scheduledAt: new Date(e.startTimestamp * 1000).toISOString(),
        status,
        homeScore: finished ? e.homeScore!.current : undefined,
        awayScore: finished ? e.awayScore?.current : undefined
      })
    }
    return { editionRef: String(this.seasonId), teams: [...teams.values()], games }
  }

  private player(p: any): NPlayer {
    const code = POS[p.primaryPosition ?? p.position]
    return {
      ref: { source: 'sofascore', id: String(p.id) },
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: p.name,
      birthDate: p.dateOfBirthTimestamp != null ? new Date(p.dateOfBirthTimestamp * 1000).toISOString().slice(0, 10) : undefined,
      nationality: p.country?.name,
      heightCm: p.height || undefined,
      position: code ? POS_NAME[code] : undefined,
      positionCode: code
    }
  }

  async roster(team: NTeam): Promise<NRosterEntry[]> {
    const d = await this.json<{ players: { player: any }[] }>(`/team/${team.clubRef.id}/players`)
    return (d.players ?? []).map(({ player: p }) => {
      const player = this.player(p)
      return { player, jerseyNumber: p.jerseyNumber ?? p.shirtNumber?.toString(), position: player.position, positionCode: player.positionCode, isActive: true }
    })
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const d = await this.json<any>(`/event/${game.ref.id}/lineups`)
    if (!d?.home?.players?.length) return undefined
    const line = (s: any = {}): NStatLine => ({
      ...zeroLine(),
      seconds: s.secondsPlayed ?? 0,
      points: s.points ?? 0,
      fg2m: s.twoPointsMade ?? 0,
      fg2a: s.twoPointAttempts ?? 0,
      fg3m: s.threePointsMade ?? 0,
      fg3a: s.threePointAttempts ?? 0,
      ftm: s.freeThrowsMade ?? 0,
      fta: s.freeThrowAttempts ?? 0,
      oreb: s.offensiveRebounds ?? 0,
      dreb: s.defensiveRebounds ?? 0,
      reb: s.rebounds ?? 0,
      ast: s.assists ?? 0,
      stl: s.steals ?? 0,
      tov: s.turnovers ?? 0,
      blk: s.blocks ?? 0,
      pf: s.personalFouls ?? 0,
      plusMinus: s.plusMinus ?? undefined,
      pir: s.pir ?? undefined
    })
    const side = (t: any, team: NTeam, isHome: boolean) => {
      const players: NPlayerLine[] = (t.players ?? [])
        .filter((p: any) => p.statistics && (p.statistics.secondsPlayed ?? 0) > 0)
        .map((p: any) => ({ ...line(p.statistics), player: this.player(p.player), jerseyNumber: p.jerseyNumber, isStarter: p.substitute === false }))
      return { team, isHome, assistantCoaches: [], periods: [{ period: 0, players, total: sumLines(players), teamOnly: { oreb: 0, dreb: 0, tov: 0 } }] }
    }
    return {
      gameRef: game.ref,
      scheduledAt: game.scheduledAt,
      status: 'finished',
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      periodScores: [],
      referees: [],
      teams: [side(d.home, game.homeTeam, true), side(d.away, game.awayTeam, false)]
    }
  }
}
