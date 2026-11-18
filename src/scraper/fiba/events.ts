/**
 * Torneos de selecciones (EuroBasket, Copa del Mundo, Juegos Olímpicos) desde la API pública de FIBA
 * (digital-api.fiba.basketball/hapi, la que usan sus webs): calendario, grupos, cruces y resultados.
 * El boxscore por partido no es accesible (las webs de FIBA bloquean las descargas automáticas); la
 * estadística por jugador del Mundial y los Juegos sale de Basketball-Reference (comando bref-torneo).
 */
import { country } from '../../../site/src/lib/countries'
import type { HttpClient } from '../core/http'
import type { CompetitionCode, NGame, NTeam } from '../types'
import type { LeagueAdapter, LeagueData } from '../europe/league'

const API = 'https://digital-api.fiba.basketball/hapi'
const KEY = '898cd5e7389140028ecb42943c47eb74'
/** competitionMarketingNameId de FIBA de cada torneo. */
export const FIBA_EVENTS: Record<string, { id: number; code: CompetitionCode; name: string }> = {
  eurobasket: { id: 208, code: 'EUROBASKET', name: 'EuroBasket' },
  mundial: { id: 201, code: 'MUNDIAL', name: 'Copa del Mundo FIBA' },
  jjoo: { id: 320, code: 'JJOO', name: 'Juegos Olímpicos' }
}
const ROUND: Record<string, [string, string, number]> = {
  GP: ['regular', 'Fase de grupos', 1],
  PR: ['regular', 'Primera fase', 1],
  R1: ['regular', 'Primera fase', 1],
  R2: ['regular', 'Segunda fase', 2],
  SR: ['regular', 'Segunda fase', 2],
  CR: ['regular', 'Fase de clasificación', 3],
  R16: ['playoff', 'Octavos de final', 4],
  QF: ['playoff', 'Cuartos de final', 5],
  SF: ['final_four', 'Semifinales', 6],
  '3PG': ['final_four', 'Tercer puesto', 7],
  F: ['final_four', 'Final', 8]
}

export class FibaEventAdapter implements LeagueAdapter {
  source = 'fiba' as const
  competition: CompetitionCode
  name: string
  constructor(
    private readonly http: HttpClient,
    private readonly event: keyof typeof FIBA_EVENTS
  ) {
    this.competition = FIBA_EVENTS[event].code
    this.name = FIBA_EVENTS[event].name
  }

  private async api<T>(path: string): Promise<T> {
    return JSON.parse((await this.http.get(`${API}/${path}`, { 'Ocp-Apim-Subscription-Key': KEY, Accept: 'application/json' })).body) as T
  }

  /** startYear = año del torneo (EuroBasket 2025 → 2025). */
  async load(startYear: number): Promise<LeagueData> {
    const ev = FIBA_EVENTS[this.event]
    const comps = await this.api<{ competitionId: number; season: number }[]>(
      `getgdapcompetitionsbyseasonsandcompetitionmarketingname?competitionMarketingNameId=${ev.id}&fromSeason=${startYear}&toSeason=${startYear}`
    )
    const compId = comps[0]?.competitionId
    if (!compId) throw new Error(`FIBA no tiene ${ev.name} ${startYear}`)
    const all = await this.api<any[]>(`getgdapgamesbycompetitionid?gdapCompetitionId=${compId}`)
    const teams = new Map<string, NTeam>()
    const groupOf = new Map<number, string>()
    for (const g of all) if (/^(GP|PR|R1)$/.test(g.round?.roundCode) && /^[A-Z]$/.test(g.groupPairingCode ?? '')) for (const t of [g.teamA, g.teamB]) if (t) groupOf.set(t.organisationId, g.groupPairingCode)
    const team = (t: any): NTeam => {
      const c = country(t.officialName) ?? country(t.code)
      const nt: NTeam = {
        ref: { source: 'fiba', id: `${ev.code}${startYear}:${t.organisationId}` },
        clubRef: { source: 'fiba', id: `nt:${t.organisationId}` },
        name: c?.name ?? t.officialName,
        shortName: c?.name ?? t.shortName,
        abbreviation: t.code,
        logoUrl: c ? `media/flags/${c.cc.toLowerCase()}.svg` : undefined,
        group: groupOf.get(t.organisationId)
      }
      teams.set(nt.ref.id, nt)
      return nt
    }
    const games: NGame[] = []
    for (const g of all) {
      if (!g.teamA || !g.teamB || !['VALID', 'INIT'].includes(g.statusCode)) continue
      const [phase, rname, num] = ROUND[g.round?.roundCode] ?? ['playoff', g.round?.roundName ?? 'Eliminatoria', 5]
      const done = g.teamAScore != null && g.teamBScore != null && g.teamAScore + g.teamBScore > 0
      games.push({
        ref: { source: 'fiba', id: String(g.gameId) },
        round: { phase, number: num, name: rname },
        homeTeam: team(g.teamA),
        awayTeam: team(g.teamB),
        scheduledAt: g.gameDateTimeUTC ? new Date(`${g.gameDateTimeUTC}Z`).toISOString() : undefined,
        status: done ? 'finished' : 'scheduled',
        homeScore: done ? g.teamAScore : undefined,
        awayScore: done ? g.teamBScore : undefined
      })
    }
    if (!games.length) throw new Error(`${ev.name} ${startYear} sin partidos`)
    return { editionRef: `fiba:${compId}`, teams: [...teams.values()], games }
  }
}
