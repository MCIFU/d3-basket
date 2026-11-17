import { describe, expect, it } from 'vitest'
import { bucketOf } from '../site/src/lib/bucket'
import { country, flagOf } from '../site/src/lib/countries'
import { lum, palette } from '../site/src/lib/color'
import { age, dayLabel, height, n1, per, val } from '../site/src/lib/fmt'
import { currentRound, minGames, percentiles, roundName } from '../site/src/lib/stats'
import type { EdFile, GameE } from '../site/src/lib/data'

const line = (o: Partial<Record<'sec' | 'pts' | 'reb' | 'ast' | 'pir' | 'f3m' | 'f3a' | 'f2a' | 'fta', number>>) => {
  const s = new Array(19).fill(0)
  s[0] = o.sec ?? 1200
  s[1] = o.pts ?? 0
  s[3] = o.f2a ?? 0
  s[4] = o.f3m ?? 0
  s[5] = o.f3a ?? 0
  s[7] = o.fta ?? 0
  s[10] = o.reb ?? 0
  s[11] = o.ast ?? 0
  s[18] = o.pir ?? null
  return s
}

describe('cubos', () => {
  it('reparte de forma estable y dentro del rango', () => {
    expect(bucketOf('20201774', 1024)).toBe(bucketOf('20201774', 1024))
    for (const r of ['a', 'f123', 'i9', '30003979']) expect(bucketOf(r, 256)).toBeLessThan(256)
  })
})

describe('países', () => {
  it('unifica las grafías de cada fuente', () => {
    for (const x of ['USA', 'EE.UU.', 'United States of America', 'Vereinigte Staaten von Amerika']) expect(country(x)?.name).toBe('Estados Unidos')
    expect(country('ESP')?.cc).toBe('ES')
    expect(country('SEN/ITA')?.name).toBe('Senegal')
    expect(country('Narnia')).toBeNull()
    expect(flagOf('ES')).toBe('🇪🇸')
  })
})

describe('formato', () => {
  it('usa coma decimal y medidas en español', () => {
    expect(n1(17.625)).toBe('17,6')
    expect(height(191)).toBe('1,91 m')
    expect(age('2000-06-15', new Date('2026-06-14'))).toBe(25)
    expect(age('2000-06-15', new Date('2026-06-15'))).toBe(26)
  })
  it('etiqueta los días respecto a hoy', () => {
    expect(dayLabel('2026-11-17', '2026-11-17').top).toBe('Hoy')
    expect(dayLabel('2026-11-16', '2026-11-17').top).toBe('Ayer')
    expect(dayLabel('2026-11-18', '2026-11-17').top).toBe('Mañana')
  })
  it('usa la valoración oficial y, si falta, la calcula', () => {
    expect(val(line({ pts: 10, pir: 15 }))).toBe(15)
    expect(val(line({ pts: 10, reb: 5, f2a: 4 }))).toBe(11)
    expect(per(line({ pts: 30, sec: 3600 }), 2).pts).toBe(15)
  })
})

describe('colores de club', () => {
  it('el fondo es siempre oscuro, aunque el club sea blanco o amarillo', () => {
    expect(lum(palette('#ffffff', '#ffd700').dk)).toBeLessThan(0.2)
    expect(lum(palette('#999999', '#fdbf00').dk)).toBeLessThan(0.2)
    expect(palette(null, null, '#0b4ea2').dk).toBe('#0b4ea2')
  })
})

describe('estadística de una edición', () => {
  const ed = {
    stats: [
      { p: 'a', t: 1, gp: 10, gs: 10, s: line({ pts: 200, reb: 50, sec: 10 * 1800, f3m: 20, f3a: 50, pir: 220 }) },
      { p: 'b', t: 2, gp: 10, gs: 5, s: line({ pts: 100, reb: 80, sec: 10 * 1500, pir: 150 }) },
      { p: 'c', t: 2, gp: 1, gs: 0, s: line({ pts: 2, sec: 300, pir: 1 }) }
    ]
  } as unknown as EdFile
  it('calcula percentiles sin contar a los jugadores sin minutos', () => {
    const pc = percentiles(ed, 'a')!
    expect(pc.pool).toBe(2)
    expect(pc.items.find((x) => x.k === 'pts')!.pct).toBe(100)
    expect(pc.items.find((x) => x.k === 'reb')!.pct).toBe(0)
  })
  it('exige un mínimo de partidos para los rankings', () => {
    expect(minGames([{ gp: 10 }, { gp: 1 }])).toBe(4)
  })
  it('elige la jornada en curso', () => {
    const g = (r: number, d: string): GameE => ({ id: String(r), ph: 'regular', r, rn: null, d, h: 1, a: 2, hs: null, as: null, st: 's', box: 0, ar: null })
    const games = [g(1, '2020-01-01T18:00:00Z'), g(2, '2020-01-08T18:00:00Z'), g(3, '2999-01-01T18:00:00Z')]
    expect(currentRound(games)).toBe('regular:2')
    expect(roundName(games[0])).toBe('Jornada 1')
  })
})
