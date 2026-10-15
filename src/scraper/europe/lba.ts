/**
 * Lega Basket Serie A (Italia) desde la API de su web oficial (www.legabasket.it/api), sin clave:
 * calendario por jornada, plantillas con fecha de nacimiento y boxscore por partido.
 */
import type { HttpClient } from '../core/http'
import type { GameStatus, NBoxscore, NGame, NPlayer, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, titleCase, type LeagueAdapter, type LeagueData } from './league'

const API = 'https://www.legabasket.it/api'
const ROLE: Record<string, PositionCode> = { Playmaker: 'PG', Play: 'PG', Guardia: 'SG', 'Guardia/Ala': 'SF', Ala: 'SF', 'Ala/Centro': 'PF', 'Ala Grande': 'PF', Centro: 'C' }

interface LbaMatch {
  id: number
  game_status: string
  match_datetime: string
  home_final_score: number | null
  visitor_final_score: number | null
  h_team_id: number
  h_team_name: string
  h_club_code: string
  v_team_id: number
  v_team_name: string
  v_club_code: string
  day_serial: number
  day_name: string
  plant_name?: string
  home_logo_key?: string | null
  v_logo_key?: string | null
}
interface LbaChamp { id: number; year: number; ctype_code: string }

export class LbaAdapter implements LeagueAdapter {
  source = 'lba' as const
  competition = 'LBA' as const
  name = 'Lega Basket Serie A'
  private teamIds = new Map<string, number>()
  constructor(private readonly http: HttpClient) {}

  private async json<T>(path: string): Promise<T> {
    return JSON.parse((await this.http.get(`${API}/${path}`, { Accept: 'application/json' })).body) as T
  }

  private team(id: number, name: string, code: string, startYear: number, logoKey?: string | null): NTeam {
    this.teamIds.set(code, id)
    return {
      ref: { source: 'lba', id: `${startYear}:${code}` },
      clubRef: { source: 'lba', id: code },
      name,
      abbreviation: code,
      logoUrl: logoKey ? `https://lba-media.s3.eu-south-1.amazonaws.com/variants/${logoKey}/large` : undefined
    }
  }

  /** Fase regular y playoff de la temporada (ids de "championship"). */
  private async championships(startYear: number) {
    const d = await this.json<{ competitions: LbaChamp[] }>('championships/get-championships?items=1000&cs_id=1')
    return d.competitions
      .filter((c) => c.year === startYear && (c.ctype_code === 'RS' || c.ctype_code === 'PO'))
      .sort((a, b) => (a.ctype_code === 'RS' ? -1 : 1) - (b.ctype_code === 'RS' ? -1 : 1))
      .map((c) => ({ id: c.id, playoff: c.ctype_code === 'PO' }))
  }

  async load(startYear: number): Promise<LeagueData> {
    const champs = await this.championships(startYear)
    if (!champs.length) throw new Error(`legabasket.it no tiene la temporada ${startYear}`)
    const teams = new Map<string, NTeam>()
    const games: NGame[] = []
    for (const c of champs) {
      const first = await this.json<{ matches: LbaMatch[]; filters?: { days?: { code: string; event_serial: number }[] } }>(`championships/get-championships-calendar-by-id?id=${c.id}`)
      const days = first.filters?.days ?? []
      for (const day of days) {
        const d = await this.json<{ matches: LbaMatch[] }>(`championships/get-championships-calendar-by-id?id=${c.id}&d=${day.code}`)
        for (const m of d.matches ?? []) {
          const home = this.team(m.h_team_id, m.h_team_name, m.h_club_code, startYear, m.home_logo_key)
          const away = this.team(m.v_team_id, m.v_team_name, m.v_club_code, startYear, m.v_logo_key)
          if (!c.playoff) (teams.set(home.ref.id, home), teams.set(away.ref.id, away))
          const finished = m.game_status === '2' && m.home_final_score != null
          const status: GameStatus = finished ? 'finished' : 'scheduled'
          games.push({
            ref: { source: 'lba', id: String(m.id) },
            round: c.playoff ? { phase: 'playoff', number: m.day_serial, name: m.day_name } : { phase: 'regular', number: m.day_serial, name: `Jornada ${m.day_serial}` },
            homeTeam: home,
            awayTeam: away,
            scheduledAt: new Date(m.match_datetime).toISOString(),
            status,
            homeScore: finished ? m.home_final_score! : undefined,
            awayScore: finished ? m.visitor_final_score! : undefined
          })
        }
      }
    }
    return { editionRef: String(champs[0].id), teams: [...teams.values()], games }
  }

  async roster(team: NTeam): Promise<NRosterEntry[]> {
    const id = this.teamIds.get(team.clubRef.id)
    if (id == null) return []
    const d = await this.json<{ players: any[] }>(`teams/get-team-roster?id=${id}`)
    return (d.players ?? []).map((p) => {
      const code = ROLE[p.player_role] as PositionCode | undefined
      const player: NPlayer = {
        ref: { source: 'lba', id: String(p.id) },
        firstName: titleCase(p.name ?? ''),
        lastName: titleCase(p.surname ?? ''),
        fullName: titleCase(`${p.name ?? ''} ${p.surname ?? ''}`.trim()),
        birthDate: p.birth_date || undefined,
        birthPlace: p.place_of_birth || undefined,
        nationality: p.country || undefined,
        heightCm: p.height || undefined,
        position: code ? POS_NAME[code] : p.player_role,
        positionCode: code
      }
      return { player, jerseyNumber: p.player_number ?? undefined, position: player.position, positionCode: code, isActive: true }
    })
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const d = await this.json<any>(`championships/get-championships-matches-scores-by-id?id=${game.ref.id}`)
    const s = d.scores
    if (!s?.ht?.rows?.length) return undefined
    const line = (r: any): NStatLine => ({
      seconds: r.sec ?? (r.min ?? 0) * 60,
      points: r.pun ?? 0,
      fg2m: r.t2_r ?? 0,
      fg2a: r.t2_t ?? 0,
      fg3m: r.t3_r ?? 0,
      fg3a: r.t3_t ?? 0,
      ftm: r.tl_r ?? 0,
      fta: r.tl_t ?? 0,
      oreb: r.rimbalzi_o ?? 0,
      dreb: r.rimbalzi_d ?? 0,
      reb: r.rimbalzi_t ?? 0,
      ast: r.ass ?? 0,
      stl: r.palle_r ?? 0,
      tov: r.palle_p ?? 0,
      blk: r.stoppate_dat ?? 0,
      blkAgainst: r.stoppate_sub ?? 0,
      dunks: r.sc ?? 0,
      pf: r.falli_c ?? 0,
      foulsDrawn: r.falli_sf ?? 0,
      plusMinus: r.plus_minus ?? undefined,
      pir: r.val_lega ?? undefined
    })
    const side = (t: any, team: NTeam, isHome: boolean) => {
      const players: NPlayerLine[] = (t.rows ?? []).map((r: any) => ({
        ...line(r),
        player: { ref: { source: 'lba', id: String(r.player_id) }, firstName: titleCase(r.player_name ?? ''), lastName: titleCase(r.player_surname ?? ''), fullName: titleCase(`${r.player_name ?? ''} ${r.player_surname ?? ''}`.trim()) },
        jerseyNumber: r.player_num != null ? String(r.player_num) : undefined,
        isStarter: r.sf === '1' || r.sf === 1
      }))
      return {
        team,
        isHome,
        headCoach: undefined,
        assistantCoaches: [],
        periods: [{ period: 0, players, total: line(t.totals ?? {}), teamOnly: { oreb: t.team?.rimbalzi_o ?? 0, dreb: t.team?.rimbalzi_d ?? 0, tov: t.team?.palle_p ?? 0 } }]
      }
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
      teams: [side(s.ht, game.homeTeam, true), side(s.vt, game.awayTeam, false)]
    }
  }
}
