import { describe, expect, it } from 'vitest'
import { leagueRanks } from '../src/db/queries'
import type { StatBlock } from '../src/shared/api'

const row = (games: number, ppg: number, tpg: number, fg3a = 0, fg3m = 0): StatBlock =>
  ({ games, ppg, tpg, fg3a, fg3m, fg3_pct: fg3a ? (100 * fg3m) / fg3a : null, fg2a: 0, fta: 0 }) as unknown as StatBlock

describe('puesto en la liga', () => {
  const a = row(10, 20, 3, 30, 12)
  const b = row(10, 15, 1, 5, 4) // pocos triples: sin puesto en T3%
  const c = row(2, 30, 0) // pocos partidos: fuera de la clasificación
  const all = [a, b, c]

  it('ordena de mayor a menor y al revés en pérdidas', () => {
    expect(leagueRanks(all, a).ppg).toEqual({ rank: 1, of: 2 })
    expect(leagueRanks(all, b).ppg).toEqual({ rank: 2, of: 2 })
    expect(leagueRanks(all, b).tpg).toEqual({ rank: 1, of: 2 })
  })

  it('exige intentos para los porcentajes y partidos para entrar', () => {
    expect(leagueRanks(all, a).fg3_pct).toEqual({ rank: 1, of: 1 })
    expect(leagueRanks(all, b).fg3_pct).toBeUndefined()
    expect(leagueRanks(all, c)).toEqual({})
  })
})
