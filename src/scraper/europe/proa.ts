/**
 * ProA (segunda división alemana) desde los servicios oficiales de la 2. Basketball-Bundesliga:
 *   api.2basketballbundesliga.de/cal/proa       calendario completo (iCal, con el id de cada partido)
 *   live.2basketballbundesliga.de/init/{id}     equipos y jugadores del partido
 *   live.2basketballbundesliga.de/socket.io     estadística en directo; el historial de un partido
 *                                               terminado trae la línea final de cada jugador
 */
import type { GameStatus, NBoxscore, NGame, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import type { HttpClient } from '../core/http'
import { currentSeasonStart } from '../feb/sync'
import { POS_NAME, sumLines, zeroLine, type LeagueAdapter, type LeagueData } from './league'

const CAL = 'https://api.2basketballbundesliga.de/cal/proa'
const LIVE = 'https://live.2basketballbundesliga.de'
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; d3-basket)' }

interface Live {
  init: { teamA: { id: string; caption: string }; teamB: { id: string; caption: string }; player: Record<string, { name: string; sname: string; num: string; team_id?: string }> }
  stats: number[][]
  starters: Map<number, number[]>
}

export class ProaAdapter implements LeagueAdapter {
  source = 'proa' as const
  competition = 'PROA' as const
  name = 'ProA'
  private live = new Map<string, Live>()
  /** Último partido jugado de cada equipo (para sacar su plantilla) y si jugaba en casa. */
  private lastGame = new Map<string, { id: string; home: boolean }>()
  constructor(private readonly http: HttpClient) {}

  /** Historial del partido por socket.io (transporte de sondeo HTTP). */
  private async history(id: string): Promise<{ stats: number[][]; starters: Map<number, number[]> }> {
    const base = `${LIVE}/socket.io/?EIO=4&transport=polling&game=${id}`
    const open = await (await fetch(base, { headers: UA })).text()
    const sid = JSON.parse(open.slice(open.indexOf('{'))).sid as string
    const url = `${base}&sid=${sid}`
    const post = (body: string) => fetch(url, { method: 'POST', body, headers: { ...UA, 'Content-Type': 'text/plain;charset=UTF-8' } })
    await post('40')
    await (await fetch(url, { headers: UA })).text()
    await post(`42${JSON.stringify(['history', id])}`)
    let buf = ''
    for (let i = 0; i < 8; i++) {
      const r = await (await fetch(url, { headers: UA })).text()
      buf += r + '\x1e'
      if (r.length < 5 || (buf.includes('[4,') && !r.includes('42['))) break
    }
    const stats: number[][] = []
    const starters = new Map<number, number[]>()
    for (const m of buf.matchAll(/42\["\d+",(\[[^\]]*\])\]/g)) {
      const a = JSON.parse(m[1]) as number[]
      if (a[0] === 4) stats.push(a)
      if (a[0] === 7 && a[1] === 1) starters.set(a[2], a.slice(3))
    }
    return { stats, starters }
  }

  private async liveData(id: string): Promise<Live | undefined> {
    if (this.live.has(id)) return this.live.get(id)
    const init = JSON.parse((await this.http.get(`${LIVE}/init/${id}`, { Accept: 'application/json' })).body)
    if (!init?.teamA) return undefined
    const { stats, starters } = await this.history(id)
    const d = { init, stats, starters }
    this.live.set(id, d)
    return d
  }

  async load(startYear: number, known: Map<string, { home: number; away: number }>): Promise<LeagueData> {
    if (startYear !== currentSeasonStart()) throw new Error('ProA: solo está disponible la temporada en curso')
    const ics = (await this.http.get(CAL)).body.replace(/\r?\n[ \t]/g, '')
    const events = ics.split('BEGIN:VEVENT').slice(1).map((e) => ({
      id: /UID:liga2-(\d+)@/.exec(e)?.[1],
      start: /DTSTART:(\d{8}T\d{6}Z)/.exec(e)?.[1],
      summary: /SUMMARY:proa Spiel (.*)/.exec(e)?.[1]?.trim()
    }))
    const teams = new Map<string, NTeam>()
    const team = (name: string): NTeam => {
      const key = name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')
      const t: NTeam = { ref: { source: 'proa', id: `${startYear}:${key}` }, clubRef: { source: 'proa', id: key }, name }
      teams.set(t.ref.id, t)
      return t
    }
    const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z`
    const valid = events.filter((e) => e.id && e.start && e.summary?.includes(' vs ')).sort((a, b) => a.start!.localeCompare(b.start!))
    const first = Date.parse(iso(valid[0].start!))
    const games: NGame[] = []
    for (const e of valid) {
      const [h, a] = e.summary!.split(' vs ')
      const at = iso(e.start!)
      const round = Math.floor((Date.parse(at) - first) / (7 * 86400_000)) + 1
      let status: GameStatus = 'scheduled'
      let homeScore: number | undefined
      let awayScore: number | undefined
      // Partido ya jugado (más de 3 h desde el inicio): el marcador sale de la estadística final.
      const done = known.get(e.id!)
      if (done) {
        homeScore = done.home
        awayScore = done.away
        status = 'finished'
      } else if (Date.parse(at) + 3 * 3600_000 < Date.now()) {
        const live = await this.liveData(e.id!).catch(() => undefined)
        if (live?.stats.length) {
          const pts = (side: number) => live.stats.filter((s) => s[2] === side).reduce((n, s) => n + (s[6] ?? 0), 0)
          homeScore = pts(1)
          awayScore = pts(2)
          status = 'finished'
        }
      }
      const home = team(h.trim())
      const away = team(a.trim())
      if (status === 'finished') (this.lastGame.set(home.ref.id, { id: e.id!, home: true }), this.lastGame.set(away.ref.id, { id: e.id!, home: false }))
      games.push({ ref: { source: 'proa', id: e.id! }, round: { phase: 'regular', number: round, name: `Jornada ${round}` }, homeTeam: home, awayTeam: away, scheduledAt: at, status, homeScore, awayScore })
    }
    return { editionRef: String(startYear), teams: [...teams.values()], games }
  }

  /** Plantilla: jugadores del último partido del equipo, con su ficha (nacimiento, altura, posición). */
  async roster(team: NTeam): Promise<NRosterEntry[]> {
    const last = this.lastGame.get(team.ref.id)
    if (!last) return []
    const init = JSON.parse((await this.http.get(`${LIVE}/init/${last.id}`, { Accept: 'application/json' })).body) as Live['init']
    const side = (last.home ? init.teamA : init.teamB) as { id: string; coach?: string }
    const teamId = side.id
    const out: NRosterEntry[] = []
    for (const [id, p] of Object.entries(init.player)) {
      if (p.team_id !== teamId || id === '0' || id === side.coach) continue
      const html = (await this.http.get(`https://www.2basketballbundesliga.de/spieler_liveticker/${id}/`).catch(() => undefined))?.body ?? ''
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      const dob = /Geburtstag:\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(text)
      const height = /Größe:\s*(\d),(\d{2})\s*m/.exec(text)
      const pos = /Position:\s*([A-Z]{1,2})\b/.exec(text)?.[1]
      const code = pos ? (({ PG: 'PG', SG: 'SG', G: 'SG', SF: 'SF', F: 'SF', PF: 'PF', C: 'C' }) as Record<string, PositionCode>)[pos] : undefined
      const photo = /https:\/\/api\.2basketballbundesliga\.de\/pics2\/[0-9_]+\/ls\/\d+/.exec(html)?.[0]
      const nat = /Nationalität:\s*([^:]+?)\s+(?:Im Verein|Nummer|$)/.exec(text)?.[1]
      const last = p.sname
      const first = p.name.endsWith(last) ? p.name.slice(0, -last.length).trim() : p.name.split(' ')[0]
      out.push({
        player: {
          ref: { source: 'proa', id },
          firstName: first,
          lastName: last,
          fullName: p.name,
          birthDate: dob ? `${dob[3]}-${dob[2]}-${dob[1]}` : undefined,
          heightCm: height ? Number(height[1]) * 100 + Number(height[2]) : undefined,
          nationality: nat,
          position: code ? POS_NAME[code] : undefined,
          positionCode: code,
          photoUrl: photo
        },
        jerseyNumber: p.num || undefined,
        position: code ? POS_NAME[code] : undefined,
        positionCode: code,
        isActive: true
      })
    }
    return out
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const live = await this.liveData(game.ref.id)
    if (!live?.stats.length) return undefined
    // [4, fila, lado, jugador, ?, dorsal, pts, tlA, tlI, tl%, t2A, t2I, t2%, t3A, t3I, t3%, faltas, reb, ast, tap, rob, pér, ?, ?, segundos, …]
    const line = (s: number[]): NStatLine => ({ ...zeroLine(), points: s[6], ftm: s[7], fta: s[8], fg2m: s[10], fg2a: s[11], fg3m: s[13], fg3a: s[14], pf: s[16], reb: s[17], ast: s[18], blk: s[19], stl: s[20], tov: s[21], seconds: s[24] ?? 0 })
    const side = (n: number, team: NTeam, isHome: boolean) => {
      const starters = new Set(live.starters.get(n) ?? [])
      const players: NPlayerLine[] = live.stats
        .filter((s) => s[2] === n && s[3])
        .map((s) => {
          const p = live.init.player[String(s[3])]
          const full = p?.name ?? `#${s[3]}`
          const last = p?.sname ?? full.split(' ').slice(-1)[0]
          const first = full.endsWith(last) ? full.slice(0, -last.length).trim() : full.split(' ')[0]
          return { ...line(s), player: { ref: { source: 'proa', id: String(s[3]) }, firstName: first, lastName: last, fullName: full }, jerseyNumber: String(s[5]), isStarter: starters.has(s[3]) }
        })
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
      teams: [side(1, game.homeTeam, true), side(2, game.awayTeam, false)]
    }
  }
}
