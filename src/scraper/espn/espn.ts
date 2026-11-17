/**
 * NBA y NCAA (División I masculina) desde la API pública de ESPN (site.api.espn.com), la que usa su web:
 *   /scoreboard?dates=AAAAMMDD     partidos de un día (con fase: temporada regular, play-in, playoffs)
 *   /teams                         equipos con colores y escudo
 *   /standings (apis/v2)           conferencias (grupos de la clasificación)
 *   /teams/{id}/roster             plantilla con nacimiento, altura, peso, foto y lugar de nacimiento
 *   /summary?event={id}            boxscore por jugador, parciales, pabellón, público y árbitros
 * nba.com bloquea las peticiones desde servidores; ESPN responde y publica lo mismo.
 */
import { country } from '../../../site/src/lib/countries'
import type { HttpClient } from '../core/http'
import type { CompetitionCode, GameStatus, NBoxscore, NGame, NPlayer, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, sumLines, zeroLine, type LeagueAdapter, type LeagueData } from '../europe/league'

const POS: Record<string, PositionCode> = { PG: 'PG', SG: 'SG', G: 'SG', SF: 'SF', F: 'SF', GF: 'SF', PF: 'PF', FC: 'PF', C: 'C' }
const CONF: Record<string, string> = { 'Eastern Conference': 'Este', 'Western Conference': 'Oeste' }
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

export class EspnAdapter implements LeagueAdapter {
  source = 'espn' as const
  private api: string
  private teams = new Map<string, any>()
  private group = new Map<string, string>()
  constructor(
    private readonly http: HttpClient,
    private readonly league: 'nba' | 'mens-college-basketball',
    public readonly competition: CompetitionCode,
    public readonly name: string
  ) {
    this.api = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}`
  }

  private async json<T = any>(url: string): Promise<T> {
    return JSON.parse((await this.http.get(url, { Accept: 'application/json' })).body) as T
  }

  private team(id: string, startYear: number, fallback?: any): NTeam {
    const t = this.teams.get(id) ?? fallback ?? {}
    return {
      ref: { source: 'espn', id: `${startYear}:${id}` },
      clubRef: { source: 'espn', id },
      name: t.displayName ?? t.name ?? id,
      shortName: t.shortDisplayName ?? t.name,
      abbreviation: t.abbreviation,
      primaryColor: t.color ? `#${t.color}` : undefined,
      logoUrl: t.logos?.[0]?.href ?? t.logo,
      group: this.group.get(id)
    }
  }

  async load(startYear: number): Promise<LeagueData> {
    // Equipos y conferencias
    const tj = await this.json(`${this.api}/teams?limit=500${this.league === 'nba' ? '' : '&groups=50'}`)
    for (const { team } of tj.sports?.[0]?.leagues?.[0]?.teams ?? []) this.teams.set(team.id, team)
    // Grupos de la clasificación: conferencias Este y Oeste (NBA) o las ~32 conferencias universitarias (NCAA).
    const st = await this.json(`https://site.api.espn.com/apis/v2/sports/basketball/${this.league}/standings?season=${startYear + 1}`).catch(() => undefined)
    for (const conf of st?.children ?? []) for (const e of conf.standings?.entries ?? []) this.group.set(e.team.id, CONF[conf.name] ?? conf.shortName ?? conf.name)
    // Calendario, día a día (ESPN no admite rangos largos): de octubre a junio.
    const from = new Date(Date.UTC(startYear, 9, 1))
    const to = new Date(Date.UTC(startYear + 1, this.league === 'nba' ? 5 : 3, 30))
    const games: NGame[] = []
    const teams = new Map<string, NTeam>()
    const first = new Map<string, number>()
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const q = this.league === 'nba' ? '' : '&groups=50&limit=500'
      const sb = await this.json(`${this.api}/scoreboard?dates=${ymd(d)}${q}`).catch(() => undefined)
      for (const e of sb?.events ?? []) {
        const slug: string = e.season?.slug ?? ''
        if (slug === 'preseason' || slug === 'off-season') continue
        const c = e.competitions?.[0]
        const h = c?.competitors?.find((x: any) => x.homeAway === 'home')
        const a = c?.competitors?.find((x: any) => x.homeAway === 'away')
        // Huecos de eliminatorias sin rival decidido (Copa NBA, playoffs): «TBD».
        if (!h || !a || [h, a].some((x: any) => !x.team?.id || /^tbd$/i.test(x.team.abbreviation ?? x.team.displayName ?? ''))) continue
        // NBA: solo partidos entre sus 30 equipos (fuera el All-Star y sus combinados).
        if (this.league === 'nba' && this.teams.size && ![h, a].every((x: any) => this.teams.has(x.team.id))) continue
        const home = this.team(h.team.id, startYear, h.team)
        const away = this.team(a.team.id, startYear, a.team)
        teams.set(home.ref.id, home)
        teams.set(away.ref.id, away)
        const fin = e.status?.type?.completed === true
        const status: GameStatus = fin ? 'finished' : e.status?.type?.name === 'STATUS_POSTPONED' ? 'postponed' : 'scheduled'
        // Temporada regular por semanas; playoffs y play-in con el nombre de la serie que da ESPN.
        const weekStart = Date.parse(e.date)
        if (!first.has(slug)) first.set(slug, weekStart)
        const week = Math.floor((weekStart - first.get(slug)!) / (7 * 86400_000)) + 1
        const note: string | undefined = c.notes?.[0]?.headline
        const phase = slug === 'post-season' ? (/play-?in/i.test(note ?? '') ? 'playin' : /finals/i.test(note ?? '') && !/conf/i.test(note ?? '') ? 'final' : 'playoff') : slug === 'play-in-season' ? 'playin' : 'regular'
        games.push({
          ref: { source: 'espn', id: String(e.id) },
          round: phase === 'regular' ? { phase, number: week, name: `Semana ${week}` } : { phase, number: week, name: note?.replace(/\s*-\s*Game \d+$/i, '') ?? 'Playoffs' },
          homeTeam: home,
          awayTeam: away,
          scheduledAt: new Date(e.date).toISOString(),
          status,
          homeScore: fin ? Number(h.score) : undefined,
          awayScore: fin ? Number(a.score) : undefined
        })
      }
    }
    if (!games.length) throw new Error(`ESPN no tiene partidos de ${this.name} ${startYear}`)
    // Equipos de la competición: en la NCAA solo los de División I (los rivales de otras divisiones
    // quedan como equipos de sus partidos, sin plantilla).
    const own = [...teams.values()].filter((t) => this.league === 'nba' || this.teams.has(t.clubRef.id))
    return { editionRef: `${this.league}:${startYear + 1}`, teams: own, games }
  }

  private player(a: any): NPlayer {
    const code = POS[a.position?.abbreviation ?? '']
    const nat = country(a.citizenship ?? a.birthPlace?.country)
    return {
      ref: { source: 'espn', id: String(a.id) },
      firstName: a.firstName,
      lastName: a.lastName,
      fullName: a.fullName ?? a.displayName,
      birthDate: a.dateOfBirth?.slice(0, 10),
      birthPlace: a.birthPlace?.city,
      birthCountry: a.birthPlace?.country,
      nationality: nat?.name ?? a.birthPlace?.country,
      heightCm: a.height ? Math.round(a.height * 2.54) : undefined,
      position: code ? POS_NAME[code] : undefined,
      positionCode: code,
      photoUrl: a.headshot?.href
    }
  }

  async roster(team: NTeam): Promise<NRosterEntry[]> {
    const r = await this.json(`${this.api}/teams/${team.clubRef.id}/roster`)
    return (r.athletes ?? []).map((a: any) => {
      const p = this.player(a)
      return { player: p, jerseyNumber: a.jersey, position: p.position, positionCode: p.positionCode, isActive: true }
    })
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const s = await this.json(`${this.api}/summary?event=${game.ref.id}`)
    const groups = s.boxscore?.players ?? []
    if (!groups.length) return undefined
    const side = (teamId: string, team: NTeam, isHome: boolean) => {
      const g = groups.find((x: any) => x.team.id === teamId)
      const st = g?.statistics?.[0]
      const names: string[] = st?.names ?? st?.labels ?? []
      const players: NPlayerLine[] = []
      for (const at of st?.athletes ?? []) {
        if (at.didNotPlay || !at.stats?.length) continue
        const v = (k: string) => at.stats[names.indexOf(k)] ?? '0'
        const pair = (k: string) => v(k).split('-').map((x: string) => Number(x) || 0)
        const [fgm, fga] = pair('FG')
        const [f3m, f3a] = pair('3PT')
        const [ftm, fta] = pair('FT')
        const n = (k: string) => Number(v(k)) || 0
        const line: NStatLine = { ...zeroLine(), seconds: n('MIN') * 60, points: n('PTS'), fg2m: fgm - f3m, fg2a: fga - f3a, fg3m: f3m, fg3a: f3a, ftm, fta, oreb: n('OREB'), dreb: n('DREB'), reb: n('REB'), ast: n('AST'), stl: n('STL'), blk: n('BLK'), tov: n('TO'), pf: n('PF'), plusMinus: Number(v('+/-')) || 0 }
        const a = at.athlete
        players.push({ ...line, player: { ref: { source: 'espn', id: String(a.id) }, firstName: a.firstName, lastName: a.lastName, fullName: a.displayName, photoUrl: a.headshot?.href }, jerseyNumber: a.jersey, isStarter: !!at.starter })
      }
      return { team, isHome, assistantCoaches: [], periods: [{ period: 0, players, total: sumLines(players), teamOnly: { oreb: 0, dreb: 0, tov: 0 } }] }
    }
    const comp = s.header?.competitions?.[0]
    const hc = comp?.competitors?.find((c: any) => c.homeAway === 'home')
    const ac = comp?.competitors?.find((c: any) => c.homeAway === 'away')
    if (!hc || !ac) return undefined
    const lsH = (hc.linescores ?? []).map((l: any) => Number(l.displayValue) || 0)
    const lsA = (ac.linescores ?? []).map((l: any) => Number(l.displayValue) || 0)
    return {
      gameRef: game.ref,
      scheduledAt: game.scheduledAt,
      status: 'finished',
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      periodScores: lsH.map((h: number, i: number) => ({ period: i + 1, home: h, away: lsA[i] ?? 0 })),
      arena: s.gameInfo?.venue?.fullName,
      attendance: s.gameInfo?.attendance || undefined,
      referees: (s.gameInfo?.officials ?? []).map((o: any) => o.displayName),
      teams: [side(hc.id, game.homeTeam, true), side(ac.id, game.awayTeam, false)]
    }
  }
}
