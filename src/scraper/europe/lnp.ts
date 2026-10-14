/**
 * Serie A2 (Italia) de la Lega Nazionale Pallacanestro: calendario en JSON (lnpstat.domino.it, el
 * servicio que usa su web) y boxscore y plantillas desde las páginas de legapallacanestro.com.
 */
import type { HttpClient } from '../core/http'
import type { GameStatus, NBoxscore, NGame, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, type LeagueAdapter, type LeagueData } from './league'

const SCHEDULE = 'https://lnpstat.domino.it/getstatisticsfiles'
const SITE = 'https://www.legapallacanestro.com'
const ROLE: Record<string, PositionCode> = { Play: 'PG', 'Play/Guardia': 'PG', Guardia: 'SG', 'Guardia/Ala': 'SF', Ala: 'SF', 'Ala/Centro': 'PF', 'Ala/Pivot': 'PF', Centro: 'C', Pivot: 'C' }
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

interface LnpGame { gameid: string; teamid_home: string; teamname_home: string; score_home: string; teamid_away: string; teamname_away: string; score_away: string; round: string; date: string; time: string; game_status: string }

export class LnpAdapter implements LeagueAdapter {
  source = 'lnp' as const
  competition = 'ITA_A2' as const
  name = 'Serie A2'
  private leagueOf = new Map<string, string>() // gameid → código de liga (ita2, ita2_a…)
  private year = ''
  constructor(private readonly http: HttpClient) {}

  async load(startYear: number): Promise<LeagueData> {
    this.year = `x${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`
    const teams = new Map<string, NTeam>()
    const games: NGame[] = []
    const team = (id: string, name: string, group?: string): NTeam => {
      const t: NTeam = { ref: { source: 'lnp', id: `${startYear}:${id}` }, clubRef: { source: 'lnp', id }, name, group }
      teams.set(t.ref.id, t)
      return t
    }
    // Liga única o, en algunas temporadas, dos grupos (ita2_a / ita2_b).
    for (const [league, group] of [
      ['ita2', undefined],
      ['ita2_a', 'A'],
      ['ita2_b', 'B']
    ] as const) {
      if (league !== 'ita2' && games.some((g) => !g.homeTeam.group)) break
      for (let round = 1; round <= 40; round++) {
        // Más allá de la última jornada el servicio responde 404 o vacío.
        let rows: LnpGame[] = []
        try {
          rows = JSON.parse((await this.http.get(`${SCHEDULE}?task=schedule&year=${this.year}&league=${league}&round=${round}`, { Accept: 'application/json' })).body) ?? []
        } catch {
          rows = []
        }
        if (!rows.length) break
        for (const r of rows) {
          this.leagueOf.set(r.gameid, league)
          const finished = r.game_status === 'finished' && r.score_home !== ''
          const status: GameStatus = finished ? 'finished' : 'scheduled'
          const [d, m, y] = r.date.split('/').map(Number)
          const [hh, mm] = (r.time || '00:00').split(':').map(Number)
          // Hora italiana: CEST (UTC+2) de abril a octubre y CET (UTC+1) el resto, aproximado por mes.
          const at = y ? new Date(Date.UTC(y, m - 1, d, hh - (m >= 4 && m <= 10 ? 2 : 1), mm)).toISOString() : undefined
          games.push({
            ref: { source: 'lnp', id: r.gameid },
            round: { phase: 'regular', number: Number(r.round), name: `Jornada ${r.round}` },
            homeTeam: team(r.teamid_home, r.teamname_home, group),
            awayTeam: team(r.teamid_away, r.teamname_away, group),
            scheduledAt: at,
            status,
            homeScore: finished ? Number(r.score_home) : undefined,
            awayScore: finished ? Number(r.score_away) : undefined
          })
        }
      }
      if (league === 'ita2' && games.length) break
    }
    if (!games.length) throw new Error(`Serie A2 ${startYear}: sin calendario`)
    return { editionRef: this.year, teams: [...teams.values()], games }
  }

  async roster(team: NTeam): Promise<NRosterEntry[]> {
    const html = (await this.http.get(`${SITE}/squadra/wp/${team.clubRef.id}`)).body
    const i = html.indexOf('id="roster-wrapper"')
    if (i < 0) return []
    const table = html.slice(i, html.indexOf('</table>', i))
    const out: NRosterEntry[] = []
    for (const tr of table.split(/<tr[\s>]/).slice(2)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1])
      const id = /player\/x\d+\/(A\d+)\./.exec(tr)?.[1]
      if (!id || cells.length < 7) continue
      const name = text(cells[1])
      const parts = name.split(/\s+/)
      const first = parts.pop() ?? ''
      const last = parts.join(' ')
      const role = text(cells[2])
      const code = ROLE[role]
      const [d, m, y] = text(cells[3]).split('/').map(Number)
      out.push({
        player: {
          ref: { source: 'lnp', id },
          firstName: first,
          lastName: last,
          fullName: `${first} ${last}`.trim(),
          birthDate: y ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined,
          heightCm: Number(text(cells[4])) || undefined,
          nationality: text(cells[6]) || undefined,
          position: code ? POS_NAME[code] : role || undefined,
          positionCode: code
        },
        jerseyNumber: text(cells[0]) || undefined,
        position: code ? POS_NAME[code] : role || undefined,
        positionCode: code,
        isActive: true
      })
    }
    return out
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const league = this.leagueOf.get(game.ref.id) ?? 'ita2'
    const html = (await this.http.get(`${SITE}/wp/match/${game.ref.id}/${league}/${this.year}`)).body
    const left = [...html.matchAll(/<td colspan="3" class="table-left">([\s\S]*?)<\/table>\s*<\/td>/g)].map((m) => m[1])
    const right = [...html.matchAll(/<td colspan="23" class="table-right">([\s\S]*?)<\/table>\s*<\/td>/g)].map((m) => m[1])
    if (left.length < 2 || right.length < 2) return undefined
    const rows = (t: string) => [...t.matchAll(/<tr class="(?:odd|even)[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]))
    const line = (c: number[]): NStatLine => ({
      seconds: (c[1] ?? 0) * 60,
      points: c[0] ?? 0,
      pf: c[2] ?? 0,
      foulsDrawn: c[3] ?? 0,
      fg2m: c[4] ?? 0,
      fg2a: c[5] ?? 0,
      fg3m: c[7] ?? 0,
      fg3a: c[8] ?? 0,
      ftm: c[10] ?? 0,
      fta: c[11] ?? 0,
      oreb: c[13] ?? 0,
      dreb: c[14] ?? 0,
      reb: c[15] ?? 0,
      blk: c[16] ?? 0,
      blkAgainst: c[17] ?? 0,
      tov: c[18] ?? 0,
      stl: c[19] ?? 0,
      ast: c[20] ?? 0,
      pir: c[21],
      dunks: 0
    })
    const side = (i: number, team: NTeam, isHome: boolean) => {
      const names = rows(left[i])
      const stats = rows(right[i]).map((r) => r.map((x) => Number(text(x)) || 0))
      const players: NPlayerLine[] = []
      let total: NStatLine | undefined
      let teamOnly = { oreb: 0, dreb: 0, tov: 0 }
      names.forEach((n, k) => {
        const s = stats[k]
        if (!s) return
        const who = text(n[2] ?? '')
        const id = /giocatore\/wp\/(A\d+)/.exec(n[2] ?? '')?.[1]
        if (who === 'Totali') total = line(s)
        else if (who === 'Squadra') teamOnly = { oreb: s[13] ?? 0, dreb: s[14] ?? 0, tov: s[18] ?? 0 }
        else if (id) {
          const parts = who.split(/\s+/)
          players.push({ ...line(s), player: { ref: { source: 'lnp', id }, firstName: parts[0], lastName: parts.slice(1).join(' '), fullName: who }, jerseyNumber: text(n[0]) || undefined, isStarter: text(n[1]) === '*' })
        }
      })
      return { team, isHome, assistantCoaches: [], periods: [{ period: 0, players, total: total ?? line([]), teamOnly }] }
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
      teams: [side(0, game.homeTeam, true), side(1, game.awayTeam, false)]
    }
  }
}
