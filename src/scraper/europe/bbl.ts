/**
 * easyCredit BBL (Alemania) desde la API que usa su web oficial (api.basketball-bundesliga.de).
 * Pide dos cabeceras: x-api-key fija y x-api-secret, que la propia web publica en cada página
 * (`__NEXT_DATA__.props.pageProps.key`, invertida y con ':' → '-').
 */
import type { HttpClient } from '../core/http'
import type { GameStatus, NBoxscore, NGame, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, sumLines, titleCase, type LeagueAdapter, type LeagueData } from './league'

const API = 'https://api.basketball-bundesliga.de'
const SITE = 'https://www.easycredit-bbl.de/'
const POS: Record<string, PositionCode> = { POINT_GUARD: 'PG', GUARD: 'SG', SHOOTING_GUARD: 'SG', SMALL_FORWARD: 'SF', FORWARD: 'SF', POWER_FORWARD: 'PF', CENTER: 'C' }
const STAGE: Record<string, string> = { MAIN_ROUND: 'regular', PLAYIN: 'playin', PLAY_IN: 'playin', PLAYOFFS: 'playoff', PLAYOFF: 'playoff' }

interface BblTeam { teamId: string; name: string; tlc: string; logoUrl?: string }
interface BblGame {
  id: string
  stage: string
  status: string
  matchDay?: number
  scheduledTime: string
  homeTeam: BblTeam
  guestTeam: BblTeam
  result?: Record<string, number | string | null>
  venue?: { name?: string }
}

export class BblAdapter implements LeagueAdapter {
  source = 'bbl' as const
  competition = 'BBL' as const
  name = 'easyCredit BBL'
  private secret?: string
  constructor(private readonly http: HttpClient) {}

  private async headers() {
    if (!this.secret) {
      const html = (await this.http.get(SITE)).body
      const m = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(html)
      const key = m ? JSON.parse(m[1])?.props?.pageProps?.key : undefined
      if (!key) throw new Error('no se encontró la clave pública de la BBL')
      this.secret = String(key).split('').reverse().join('').replace(/:/g, '-')
    }
    return { 'x-api-key': 'publicWebUser', 'x-api-secret': this.secret, Accept: 'application/json' }
  }

  private async json<T>(path: string): Promise<T> {
    return JSON.parse((await this.http.get(`${API}${path}`, await this.headers())).body) as T
  }

  private team(t: BblTeam, startYear: number): NTeam {
    return { ref: { source: 'bbl', id: `${startYear}:${t.teamId}` }, clubRef: { source: 'bbl', id: t.teamId }, name: t.name, abbreviation: t.tlc, logoUrl: t.logoUrl }
  }

  async load(startYear: number): Promise<LeagueData> {
    const games: BblGame[] = []
    for (const type of ['finished', 'scheduled']) {
      for (let page = 1; ; page++) {
        const d = await this.json<{ items: BblGame[]; totalPages: number }>(`/games?currentPage=${page}&pageSize=100&gameType=${type}&seasonId=${startYear}`)
        games.push(...(d.items ?? []))
        if (page >= (d.totalPages ?? 1)) break
      }
    }
    const bbl = games.filter((g) => !g.stage || STAGE[g.stage] || g.stage === 'MAIN_ROUND')
    const teams = new Map<string, NTeam>()
    const out: NGame[] = []
    for (const g of bbl) {
      const home = this.team(g.homeTeam, startYear)
      const away = this.team(g.guestTeam, startYear)
      const phase = STAGE[g.stage] ?? 'regular'
      if (phase === 'regular') (teams.set(home.ref.id, home), teams.set(away.ref.id, away))
      const hs = Number(g.result?.homeTeamFinalScore)
      const as = Number(g.result?.guestTeamFinalScore)
      const finished = Number.isFinite(hs) && Number.isFinite(as) && hs + as > 0 && g.status !== 'SCHEDULED'
      const status: GameStatus = finished ? 'finished' : 'scheduled'
      out.push({
        ref: { source: 'bbl', id: String(g.id) },
        round: { phase, number: g.matchDay ?? 0, name: phase === 'regular' ? `Jornada ${g.matchDay}` : g.stage },
        homeTeam: home,
        awayTeam: away,
        scheduledAt: g.scheduledTime,
        status,
        homeScore: finished ? hs : undefined,
        awayScore: finished ? as : undefined
      })
    }
    return { editionRef: String(startYear), teams: [...teams.values()], games: out }
  }

  async roster(team: NTeam, startYear: number): Promise<NRosterEntry[]> {
    const d = await this.json<{ players: any[] }>(`/teams/${team.clubRef.id}/${startYear}`)
    return (d.players ?? []).map((p) => {
      const code = POS[p.position]
      return {
        player: {
          ref: { source: 'bbl', id: String(p.realPlayerId ?? p.playerId) },
          firstName: p.firstName,
          lastName: p.lastName,
          fullName: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
          birthDate: p.birthDate || undefined,
          nationality: p.nationalities?.[0],
          heightCm: p.height ? Math.round(p.height * 100) : undefined,
          position: code ? POS_NAME[code] : undefined,
          positionCode: code
        },
        jerseyNumber: p.shirtNumber || undefined,
        position: code ? POS_NAME[code] : undefined,
        positionCode: code,
        isActive: p.isActive !== 0
      }
    })
  }

  async boxscore(game: NGame, startYear: number): Promise<NBoxscore | undefined> {
    const d = await this.json<any>(`/games/${game.ref.id}/stats`)
    if (!d?.homeTeam?.playerStats?.length) return undefined
    const line = (s: any): NStatLine => ({
      seconds: s.secondsPlayed ?? 0,
      points: s.points ?? 0,
      fg2m: s.twoPointShotsMade ?? 0,
      fg2a: s.twoPointShotsAttempted ?? 0,
      fg3m: s.threePointShotsMade ?? 0,
      fg3a: s.threePointShotsAttempted ?? 0,
      ftm: s.freeThrowsMade ?? 0,
      fta: s.freeThrowsAttempted ?? 0,
      oreb: s.offensiveRebounds ?? 0,
      dreb: s.defensiveRebounds ?? 0,
      reb: s.totalRebounds ?? 0,
      ast: s.assists ?? 0,
      stl: s.steals ?? 0,
      tov: s.turnovers ?? 0,
      blk: s.blocks ?? 0,
      blkAgainst: 0,
      dunks: 0,
      pf: s.foulsCommitted ?? 0,
      foulsDrawn: s.foulsReceived ?? 0,
      plusMinus: s.plusMinus ?? undefined,
      pir: s.efficiency ?? undefined
    })
    const side = (t: any, team: NTeam, isHome: boolean) => {
      const players: NPlayerLine[] = (t.playerStats ?? []).map((s: any) => {
        const p = s.seasonPlayer ?? {}
        return {
          ...line(s),
          player: { ref: { source: 'bbl', id: String(p.realPlayerId ?? p.playerId) }, firstName: p.firstName, lastName: p.lastName, fullName: titleCase(`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) },
          jerseyNumber: s.shirtNumber ?? p.shirtNumber,
          isStarter: !!s.isStartingFive
        }
      })
      const g = t.gameStat ?? {}
      return {
        team,
        isHome,
        headCoach: t.headCoachName || undefined,
        assistantCoaches: [],
        periods: [{ period: 0, players, total: g.points != null ? line(g) : sumLines(players), teamOnly: { oreb: 0, dreb: 0, tov: 0 } }]
      }
    }
    void startYear
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
      teams: [side(d.homeTeam, game.homeTeam, true), side(d.guestTeam, game.awayTeam, false)]
    }
  }
}
