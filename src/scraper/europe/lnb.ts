/**
 * LNB (Francia): Betclic Élite y Élite 2 desde la API de lnb.fr (token público de 15 minutos que
 * la web pide en /api/token) y el boxscore del widget oficial de estadísticas (Sportradar/Atrium,
 * web 12 = LNB). Los jugadores del boxscore se enlazan con la plantilla por nombre y equipo.
 */
import type { HttpClient } from '../core/http'
import type { GameStatus, NBoxscore, NGame, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, type LeagueAdapter, type LeagueData } from './league'

const API = 'https://api-prod.lnb.fr'
const STATS = 'https://embed-api.eui.connect.sportradar.com/v1/embed/12'
const POS: Record<string, PositionCode> = { '1': 'PG', '2': 'SG', '3': 'SF', '4': 'PF', '5': 'C' }
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
const isoSecs = (m?: string | null) => {
  const r = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(m ?? '')
  return r ? Number(r[1] ?? 0) * 60 + Number(r[2] ?? 0) : 0
}

interface LnbTeam { team_id: string; external_id: number; club_external_id: number; club_name: string; team_name: string; team_code: string; score_string?: string; logo_black?: { md?: string } }
interface LnbMatch { match_id: string; external_id: number; match_time_utc: string; match_status: string; round_number: number; round_description?: string; teams: LnbTeam[]; venue_name?: string }

export class LnbAdapter implements LeagueAdapter {
  source = 'lnb' as const
  name: string
  private token?: { value: string; at: number }
  private comps: { id: number; playoff: boolean }[] = []
  /** Plantilla por equipo: nombre normalizado → id de jugador de la LNB. */
  private names = new Map<string, Map<string, string>>()
  private uuidOf = new Map<string, string>() // team ref → team uuid (Sportradar)
  constructor(
    private readonly http: HttpClient,
    private readonly division: 1 | 2,
    public readonly competition: 'LNB_ELITE' | 'LNB_ELITE2'
  ) {
    this.name = division === 1 ? 'Betclic Élite' : 'Élite 2'
  }

  private async headers() {
    if (!this.token || Date.now() - this.token.at > 10 * 60_000) {
      const d = JSON.parse((await this.http.get('https://lnb.fr/api/token', { Accept: 'application/json' })).body)
      this.token = { value: d.token, at: Date.now() }
    }
    return { Authorization: `Bearer ${this.token.value}`, device_type: 'web', Accept: 'application/json' }
  }

  private async get<T>(path: string): Promise<T> {
    return JSON.parse((await this.http.get(`${API}/${path}`, await this.headers())).body).data as T
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return JSON.parse((await this.http.postJson(`${API}/${path}`, body, await this.headers())).body).data as T
  }

  private team(t: LnbTeam, startYear: number): NTeam {
    const ref = `${startYear}:${t.club_external_id}`
    this.uuidOf.set(ref, t.team_id)
    return { ref: { source: 'lnb', id: ref }, clubRef: { source: 'lnb', id: String(t.club_external_id) }, name: t.team_name || t.club_name, abbreviation: t.team_code, logoUrl: t.logo_black?.md }
  }

  async load(startYear: number): Promise<LeagueData> {
    const comps = await this.get<{ external_id: number; competition_name: string }[]>(`competition/getDivisionCompetitionByYear?year=${startYear}&division_external_id=${this.division}`)
    this.comps = comps.filter((c) => !/leaders|coupe|cup|all.?star|supercoupe/i.test(c.competition_name)).map((c) => ({ id: c.external_id, playoff: /play/i.test(c.competition_name) }))
    if (!this.comps.length) throw new Error(`lnb.fr no tiene la temporada ${startYear}`)
    const teams = new Map<string, NTeam>()
    const games: NGame[] = []
    for (const c of this.comps) {
      let empty = 0
      for (let round = 1; round <= 60 && empty < 3; round++) {
        const d = await this.post<{ matches?: LnbMatch[] }>('match/getMatchesByCompetitionAndRound', { competition_external_id: c.id, round_number: round })
        const ms = d?.matches ?? []
        if (!ms.length) {
          empty++
          continue
        }
        empty = 0
        for (const m of ms) {
          if (m.teams?.length !== 2) continue
          const home = this.team(m.teams[0], startYear)
          const away = this.team(m.teams[1], startYear)
          if (!c.playoff) (teams.set(home.ref.id, home), teams.set(away.ref.id, away))
          const finished = m.match_status === 'COMPLETE'
          const status: GameStatus = finished ? 'finished' : 'scheduled'
          games.push({
            ref: { source: 'lnb', id: m.match_id },
            round: c.playoff ? { phase: 'playoff', number: round, name: m.round_description } : { phase: 'regular', number: round, name: `Jornada ${round}` },
            homeTeam: home,
            awayTeam: away,
            scheduledAt: m.match_time_utc,
            status,
            homeScore: finished ? Number(m.teams[0].score_string) : undefined,
            awayScore: finished ? Number(m.teams[1].score_string) : undefined
          })
        }
      }
    }
    return { editionRef: String(this.comps[0].id), teams: [...teams.values()], games }
  }

  async roster(team: NTeam): Promise<NRosterEntry[]> {
    const teamExt = await this.teamExternalId(team)
    if (teamExt == null) return []
    const d = await this.get<any[]>(`teams/getRoster?team_external_id=${teamExt}&competition_external_id=${this.comps[0].id}`)
    const names = new Map<string, string>()
    this.names.set(team.ref.id, names)
    return (d ?? []).map((r) => {
      const p = r.person ?? {}
      const code = POS[String(r.player_role?.playing_position ?? '').charAt(0)]
      const id = String(p.external_id)
      names.set(norm(`${p.first_name} ${p.family_name}`), id)
      names.set(norm(String(p.family_name ?? '')), names.has(norm(String(p.family_name ?? ''))) ? '' : id)
      return {
        player: {
          ref: { source: 'lnb', id },
          firstName: p.first_name,
          lastName: p.family_name,
          fullName: `${p.first_name ?? ''} ${p.family_name ?? ''}`.trim(),
          birthDate: p.dob?.slice(0, 10),
          nationality: p.nationality,
          heightCm: p.height || undefined,
          position: code ? POS_NAME[code] : undefined,
          positionCode: code
        },
        jerseyNumber: r.player_role?.shirt_number || undefined,
        position: code ? POS_NAME[code] : undefined,
        positionCode: code,
        isActive: true
      }
    })
  }

  /** Id numérico del equipo en la LNB (el de la plantilla), a partir de la lista de equipos. */
  private teamExt = new Map<string, number>()
  private async teamExternalId(team: NTeam) {
    if (!this.teamExt.size) {
      const d = await this.get<{ external_id: number; club_external_id?: number; club?: { external_id: number } }[]>(`competition/getCompetitionTeams?competition_external_id=${this.comps[0].id}`)
      for (const t of d ?? []) {
        const club = t.club_external_id ?? t.club?.external_id
        if (club != null) this.teamExt.set(String(club), t.external_id)
      }
    }
    return this.teamExt.get(team.clubRef.id)
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const d = JSON.parse((await this.http.get(`${STATS}/fixture_detail?fixtureId=${game.ref.id}`, { Accept: 'application/json' })).body)
    const base = d?.data?.statistics?.data?.base
    if (!base?.home?.persons?.[0]?.rows?.length) return undefined
    const line = (s: any): NStatLine => ({
      seconds: isoSecs(s.minutes),
      points: s.points ?? 0,
      fg2m: s.pointsTwoMade ?? 0,
      fg2a: s.pointsTwoAttempted ?? 0,
      fg3m: s.pointsThreeMade ?? 0,
      fg3a: s.pointsThreeAttempted ?? 0,
      ftm: s.freeThrowsMade ?? 0,
      fta: s.freeThrowsAttempted ?? 0,
      oreb: s.reboundsOffensive ?? 0,
      dreb: s.reboundsDefensive ?? 0,
      reb: s.rebounds ?? 0,
      ast: s.assists ?? 0,
      stl: s.steals ?? 0,
      tov: s.turnovers ?? 0,
      blk: s.blocks ?? 0,
      blkAgainst: s.blocksReceived ?? 0,
      dunks: 0,
      pf: s.foulsTotal ?? 0,
      foulsDrawn: 0,
      plusMinus: s.plusMinus ?? undefined,
      pir: s.efficiency ?? undefined
    })
    const side = (t: any, team: NTeam, isHome: boolean) => {
      const names = this.names.get(team.ref.id)
      const players: NPlayerLine[] = (t.persons?.[0]?.rows ?? [])
        .filter((r: any) => r.participated !== false && r.personName)
        .map((r: any) => {
          const full = String(r.personName)
          const last = full.split(' ').slice(1).join(' ')
          const id = names?.get(norm(full)) || names?.get(norm(last)) || r.personId
          return {
            ...line(r.statistics ?? {}),
            player: { ref: { source: 'lnb', id }, firstName: full.split(' ')[0], lastName: last, fullName: full },
            jerseyNumber: r.bib ?? undefined,
            isStarter: !!r.starter
          }
        })
      return { team, isHome, assistantCoaches: [], periods: [{ period: 0, players, total: line(t.entity ?? {}), teamOnly: { oreb: t.extra?.reboundsOffensive ?? 0, dreb: t.extra?.reboundsDefensive ?? 0, tov: t.extra?.turnovers ?? 0 } }] }
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
      teams: [side(base.home, game.homeTeam, true), side(base.away, game.awayTeam, false)]
    }
  }
}
