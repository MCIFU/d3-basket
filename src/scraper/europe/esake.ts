/**
 * Greek Basketball League (Grecia) desde las páginas oficiales de esake.gr: resultados por
 * jornada, boxscore de cada partido (mode=3) y ficha de cada jugador (fecha de nacimiento, altura).
 * Los nombres de los equipos solo se publican en griego: se transliteran al alfabeto latino.
 */
import type { HttpClient } from '../core/http'
import type { GameStatus, NBoxscore, NGame, NPlayerLine, NRosterEntry, NStatLine, NTeam, PositionCode } from '../types'
import { POS_NAME, sumLines, titleCase, type LeagueAdapter, type LeagueData } from './league'

const SITE = 'https://www.esake.gr/en/action'
const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
const POS: Record<string, PositionCode> = { PG: 'PG', G: 'SG', SG: 'SG', SF: 'SF', F: 'SF', PF: 'PF', C: 'C' }
const GREEK: Record<string, string> = {
  Α: 'A', Ά: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Έ: 'E', Ζ: 'Z', Η: 'I', Ή: 'I', Θ: 'TH', Ι: 'I', Ί: 'I', Ϊ: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Ό: 'O',
  Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Ύ: 'Y', Ϋ: 'Y', Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O', Ώ: 'O'
}
/** ΠΑΝΑΘΗΝΑΪΚΟΣ AKTOR → Panathinaikos Aktor. */
export const greekToLatin = (s: string) =>
  titleCase(
    s
      .toUpperCase()
      .replace(/ΟΥ/g, 'OU')
      .replace(/ΑΥ/g, 'AV')
      .replace(/ΕΥ/g, 'EV')
      .replace(/ΜΠ/g, 'B')
      .replace(/ΝΤ/g, 'NT')
      .replace(/[Ͱ-Ͽ]/g, (c) => GREEK[c] ?? c)
  )
const strip = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

export class EsakeAdapter implements LeagueAdapter {
  source = 'esake' as const
  competition = 'GBL' as const
  name = 'Greek Basketball League'
  private teamIdByName = new Map<string, string>()
  constructor(private readonly http: HttpClient) {}

  private async page(path: string) {
    return (await this.http.get(`${SITE}/${path}`)).body
  }

  async load(startYear: number): Promise<LeagueData> {
    const first = await this.page('EsakeResults')
    const label = new RegExp(`${startYear}-(?:${startYear + 1}|${String(startYear + 1).slice(-2)})\\b`)
    const champ = [...first.matchAll(/<option value="([0-9A-F]{8})"[^>]*>([^<]*)/g)].find((m) => label.test(m[2]))?.[1]
    if (!champ) throw new Error(`esake.gr no tiene la temporada ${startYear}`)
    const r1 = await this.page(`EsakeResults?idchampionship=${champ}&idteam=&idseason=00000001&series=01`)
    for (const m of r1.matchAll(/EsaketeamView\?idteam=([0-9A-F]{8})&mode=1" title="([^"]+)"/g)) this.teamIdByName.set(strip(m[2]), m[1])
    const series = [...new Set([...r1.matchAll(/new Option\('[^']*', '(\d+)'\)/g)].map((m) => m[1]))]
    const teams = new Map<string, NTeam>()
    const games: NGame[] = []
    const team = (greek: string): NTeam => {
      const id = this.teamIdByName.get(greek) ?? greek
      const t: NTeam = { ref: { source: 'esake', id: `${startYear}:${id}` }, clubRef: { source: 'esake', id }, name: greekToLatin(greek) }
      teams.set(t.ref.id, t)
      return t
    }
    for (const s of series) {
      const html = s === '01' ? r1 : await this.page(`EsakeResults?idchampionship=${champ}&idteam=&idseason=00000001&series=${s}`)
      for (const block of html.split('<div class="esake-program-game">').slice(1)) {
        const id = /idgame=([0-9A-F]{8})/.exec(block)?.[1]
        const names = [...block.matchAll(/esake-program-game-final-score[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>/g)][0]
        if (!id || !names) continue
        const home = team(strip(names[1]))
        const away = team(strip(names[3]))
        const score = /(\d+)\s*-\s*(\d+)/.exec(strip(names[2]))
        const when = /(\d{1,2}) ([A-Z][a-z]{2})\s*-?\s*(\d{1,2}):(\d{2})/.exec(strip(block))
        let scheduledAt: string | undefined
        if (when) {
          const month = MONTHS[when[2]]
          const year = month >= 8 ? startYear : startYear + 1
          // Hora de Grecia: UTC+3 en horario de verano (abril-octubre), UTC+2 el resto.
          scheduledAt = new Date(Date.UTC(year, month - 1, Number(when[1]), Number(when[3]) - (month >= 4 && month <= 10 ? 3 : 2), Number(when[4]))).toISOString()
        }
        const status: GameStatus = score ? 'finished' : 'scheduled'
        games.push({
          ref: { source: 'esake', id },
          round: { phase: 'regular', number: Number(s), name: `Jornada ${Number(s)}` },
          homeTeam: home,
          awayTeam: away,
          scheduledAt,
          status,
          homeScore: score ? Number(score[1]) : undefined,
          awayScore: score ? Number(score[2]) : undefined
        })
      }
    }
    return { editionRef: champ, teams: [...teams.values()], games }
  }

  async roster(team: NTeam): Promise<NRosterEntry[]> {
    if (!/^[0-9A-F]{8}$/.test(team.clubRef.id)) return []
    const html = await this.page(`EsaketeamView?idteam=${team.clubRef.id}&mode=2`)
    const ids = [...new Set([...html.matchAll(/idplayer=([0-9A-F]{8})/g)].map((m) => m[1]))]
    const out: NRosterEntry[] = []
    for (const id of ids) {
      const p = await this.page(`EsakeplayerView?idplayer=${id}&mode=2`)
      const name = /<SPAN>([^<]+)<\/SPAN>\s*(?:<BR\/>)?\s*([^<]+)</i.exec(p.slice(p.indexOf('DATE OF BIRTH') - 4000))
      const info = strip(p.slice(p.indexOf('DATE OF BIRTH') - 300, p.indexOf('DATE OF BIRTH') + 300))
      const dob = /DATE OF BIRTH (\d{2})-(\d{2})-(\d{4})/.exec(info)
      const height = /HEIGHT (\d)\.(\d{2}) m/.exec(info)
      const pos = /POST ([A-Z]{1,2})\b/.exec(info)?.[1]
      const code = pos ? POS[pos] : undefined
      const last = name ? titleCase(name[1].trim()) : ''
      const first = name ? titleCase(name[2].trim()) : ''
      if (!last) continue
      out.push({
        player: {
          ref: { source: 'esake', id },
          firstName: first,
          lastName: last,
          fullName: `${first} ${last}`.trim(),
          birthDate: dob ? `${dob[3]}-${dob[2]}-${dob[1]}` : undefined,
          heightCm: height ? Number(height[1]) * 100 + Number(height[2]) : undefined,
          position: code ? POS_NAME[code] : undefined,
          positionCode: code
        },
        position: code ? POS_NAME[code] : undefined,
        positionCode: code,
        isActive: true
      })
    }
    return out
  }

  async boxscore(game: NGame): Promise<NBoxscore | undefined> {
    const html = await this.page(`EsakegameView?idgame=${game.ref.id}&mode=3`)
    const tables = [...html.matchAll(/<table class="table table-esake[^"]*">([\s\S]*?)<\/table>/g)].map((m) => m[1])
    if (tables.length < 2) return undefined
    const pair = (s: string) => s.split('-').map((x) => Number(x.trim()) || 0)
    const side = (t: string, team: NTeam, isHome: boolean) => {
      const players: NPlayerLine[] = []
      for (const tr of t.split('<tbody>')[1]?.split('<tr') ?? []) {
        const id = /idplayer=([0-9A-F]{8})/.exec(tr)?.[1]
        const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1])
        if (!id || cells.length < 17) continue
        const name = /<SPAN>([^<]+)<\/SPAN>\s*([^<]*)/i.exec(cells[0])
        const num = /#(\d+)/.exec(cells[0])?.[1]
        const [f2m, f2a] = pair(strip(cells[2]))
        const [f3m, f3a] = pair(strip(cells[3]))
        const [ftm, fta] = pair(strip(cells[4]))
        const [h = 0, m = 0, s = 0] = strip(cells[15]).split(':').map(Number)
        const n = (i: number) => Number(strip(cells[i])) || 0
        const line: NStatLine = { seconds: h * 3600 + m * 60 + s, points: n(1), fg2m: f2m, fg2a: f2a, fg3m: f3m, fg3a: f3a, ftm, fta, reb: n(5), dreb: n(6), oreb: n(7), ast: n(8), blk: n(9), blkAgainst: n(10), foulsDrawn: n(11), pf: n(12), stl: n(13), tov: n(14), dunks: 0, pir: n(16) }
        const last = name ? titleCase(name[1].trim()) : ''
        const first = name ? titleCase(name[2].trim()) : ''
        players.push({ ...line, player: { ref: { source: 'esake', id }, firstName: first, lastName: last, fullName: `${first} ${last}`.trim() }, jerseyNumber: num, isStarter: false })
      }
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
      teams: [side(tables[0], game.homeTeam, true), side(tables[1], game.awayTeam, false)]
    }
  }
}
