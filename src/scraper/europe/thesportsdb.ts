/**
 * Historia de la Basketbol Süper Ligi turca desde TheSportsDB (API pública gratuita): resultados de
 * cada jornada y de los playoffs desde 2015-16, sin estadística por jugador. tbf.org.tr está tras
 * Cloudflare y Sofascore limita las descargas, así que es la única fuente abierta de temporadas pasadas.
 * Rondas de TheSportsDB: 1..34 liga regular, 125 cuartos, 150 semifinales, 200 final.
 * Límite del plan gratuito: unas 30 peticiones por minuto (usar --delay 2500).
 */
import type { HttpClient } from '../core/http'
import type { NGame, NTeam } from '../types'
import type { LeagueAdapter, LeagueData } from './league'

const API = 'https://www.thesportsdb.com/api/v1/json/123'
const LEAGUE = 4475
/** Equipos de TheSportsDB que ya existen como clubes de Sofascore (temporada actual): mismo club. */
const SOFASCORE: Record<string, string> = {
  '136066': '3515', '136071': '3514', '135885': '6678', '136072': '25426', '136326': '24085', '136078': '37760',
  '136076': '25430', '136325': '265894', '136079': '45022', '137286': '253781', '143949': '234214', '144008': '304491',
  '153143': '460132', '153152': '830362', '153154': '414752'
}
const KO: Record<number, [string, 'playoff' | 'final']> = { 125: ['Cuartos de final', 'playoff'], 150: ['Semifinales', 'playoff'], 200: ['Final', 'final'] }

export class TheSportsDbBslAdapter implements LeagueAdapter {
  source = 'tsdb' as const
  competition = 'BSL' as const
  name = 'Basketbol Süper Ligi'
  constructor(private readonly http: HttpClient) {}

  private async round(r: number, season: string): Promise<any[]> {
    const d = JSON.parse((await this.http.get(`${API}/eventsround.php?id=${LEAGUE}&r=${r}&s=${season}`, { Accept: 'application/json' })).body)
    return d?.events ?? []
  }

  private team(id: string, name: string, badge: string | null, y: number): NTeam {
    const sofa = SOFASCORE[id]
    return {
      ref: { source: 'tsdb', id: `${y}:${id}` },
      clubRef: sofa ? { source: 'sofascore', id: sofa } : { source: 'tsdb', id },
      name: name.replace(/\s+(SK|BK|Basketbol|Basketball|Basket)$/i, '').trim() || name,
      logoUrl: sofa ? `https://img.sofascore.com/api/v1/team/${sofa}/image` : badge ?? undefined
    }
  }

  async load(startYear: number): Promise<LeagueData> {
    const season = `${startYear}-${startYear + 1}`
    const events: [number, any][] = []
    let empty = 0
    for (let r = 1; r <= 40 && empty < 2; r++) {
      const ev = await this.round(r, season)
      empty = ev.length ? 0 : empty + 1
      for (const e of ev) events.push([r, e])
    }
    for (const r of Object.keys(KO).map(Number)) for (const e of await this.round(r, season)) events.push([r, e])
    if (!events.length) throw new Error(`TheSportsDB no tiene la BSL ${season}`)
    const teams = new Map<string, NTeam>()
    const games: NGame[] = []
    for (const [r, e] of events) {
      const home = this.team(e.idHomeTeam, e.strHomeTeam, e.strHomeTeamBadge, startYear)
      const away = this.team(e.idAwayTeam, e.strAwayTeam, e.strAwayTeamBadge, startYear)
      teams.set(home.ref.id, home)
      teams.set(away.ref.id, away)
      const fin = e.intHomeScore != null && e.intAwayScore != null && e.intHomeScore !== '' && e.strPostponed !== 'yes'
      const ko = KO[r]
      games.push({
        ref: { source: 'tsdb', id: String(e.idEvent) },
        round: ko ? { phase: ko[1], number: r, name: ko[0] } : { phase: 'regular', number: r, name: `Jornada ${r}` },
        homeTeam: home,
        awayTeam: away,
        scheduledAt: e.strTimestamp ? new Date(`${e.strTimestamp}Z`).toISOString() : e.dateEvent ? `${e.dateEvent}T18:00:00.000Z` : undefined,
        status: fin ? 'finished' : e.strPostponed === 'yes' ? 'postponed' : 'scheduled',
        homeScore: fin ? Number(e.intHomeScore) : undefined,
        awayScore: fin ? Number(e.intAwayScore) : undefined
      })
    }
    return { editionRef: `tsdb:${startYear}`, teams: [...teams.values()], games }
  }
}
