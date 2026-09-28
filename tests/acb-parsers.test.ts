import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  ParseError,
  mapStatus,
  parseBoxscore,
  parseCalendar,
  parseClock,
  parseDmy,
  parseEditions,
  parseHeightCm,
  parsePlayerProfile,
  parseRoster,
  parseTeamSchedule,
  positionCode
} from '../src/scraper/acb/parsers'
import { RscDocument } from '../src/scraper/core/rsc'

// Copias reales de acb.com descargadas el 28/09/2026 (jornada 1 de la 2026-27 ya jugada).
const fixture = (name: string) =>
  zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'acb', `${name}.html.gz`))).toString('utf8')

describe('utilidades', () => {
  it('normaliza posiciones, fechas, alturas y minutos', () => {
    expect(positionCode('Ala-pívot')).toBe('PF')
    expect(positionCode('Pívot')).toBe('C')
    expect(positionCode('Base')).toBe('PG')
    expect(positionCode('Entrenador')).toBeUndefined()
    expect(parseDmy('15-11-1987')).toBe('1987-11-15')
    expect(parseHeightCm('1,90')).toBe(190)
    expect(parseHeightCm(202)).toBe(202)
    expect(parseClock('21:02')).toBe(1262)
    expect(mapStatus('FINALIZED')).toBe('finished')
    expect(mapStatus('NOT_SCHEDULED')).toBe('unscheduled')
    expect(mapStatus('STARTED')).toBe('live')
  })
})

describe('calendario 2026-27', () => {
  const cal = parseCalendar(fixture('calendario-2026'))

  it('detecta la edición actual', () => {
    expect(cal.edition.ref.id).toBe('91')
    expect(cal.edition.startYear).toBe(2026)
    expect(cal.edition.isCurrent).toBe(true)
  })

  it('trae 18 equipos con club, colores y slug', () => {
    expect(cal.teams).toHaveLength(18)
    const rm = cal.teams.find((t) => t.clubRef.id === '9')!
    expect(rm.name).toBe('Real Madrid')
    expect(rm.abbreviation).toBe('RMB')
    expect(rm.slug).toBe('real-madrid-9')
  })

  it('trae la liga regular completa (34 jornadas × 9 partidos)', () => {
    expect(cal.games).toHaveLength(306)
    expect(new Set(cal.games.map((g) => g.round?.number)).size).toBe(34)
    expect(cal.games.every((g) => g.homeTeam.ref.id !== g.awayTeam.ref.id)).toBe(true)
  })

  it('incluye los resultados de la jornada 1', () => {
    const finished = cal.games.filter((g) => g.status === 'finished')
    expect(finished).toHaveLength(9)
    const g = finished.find((x) => x.ref.id === '105375')!
    expect(g.homeTeam.name).toBe('Surne Bilbao')
    expect(g.awayTeam.name).toBe('Kids&Us Manresa')
    expect([g.homeScore, g.awayScore]).toEqual([107, 92])
    expect(g.scheduledAt).toBe('2026-09-26T16:00:00Z')
    expect(cal.games.filter((x) => x.status === 'scheduled').every((x) => x.homeScore === undefined)).toBe(true)
  })
})

describe('plantilla', () => {
  it('Real Madrid 2026-27: jugadores, licencias y cuerpo técnico', () => {
    const r = parseRoster(fixture('plantilla-real-madrid-2026'))
    const active = r.players.filter((p) => p.isActive)
    expect(active.length).toBe(15)
    const tavares = active.find((p) => p.player.ref.id === '20209407')!
    expect(tavares.player.knownAs).toBe('Edy Tavares')
    expect(tavares.positionCode).toBe('C')
    expect(tavares.player.heightCm).toBe(220)
    expect(tavares.licenseType).toBe('JFL')
    expect(r.staff.find((s) => s.role === 'head_coach')?.fullName).toBe('Pedro Martínez')
    expect(r.editions.find((e) => e.startYear === 2025)?.ref.id).toBe('90')
  })

  it('temporada pasada incluye bajas como inactivas', () => {
    const r = parseRoster(fixture('plantilla-real-madrid-2025'))
    expect(r.players.some((p) => !p.isActive && p.player.fullName.includes('Bruno'))).toBe(true)
    expect(r.staff.find((s) => s.role === 'head_coach')?.fullName).toBe('Sergio Scariolo')
  })
})

describe('ficha de jugador', () => {
  it('lee datos biográficos', () => {
    const p = parsePlayerProfile(fixture('jugador-llull'))
    expect(p.fullName).toBe('Sergio Llull')
    expect(p.birthDate).toBe('1987-11-15')
    expect(p.birthPlace).toBe('Mahón')
    expect(p.nationality).toBe('España')
    expect(p.heightCm).toBe(190)
  })

  it('lista las temporadas en las que ha jugado', () => {
    const eds = parseEditions(RscDocument.fromHtml(fixture('jugador-llull')))
    expect(eds[0]).toMatchObject({ startYear: 2026, ref: { id: '91' } })
    expect(eds.length).toBeGreaterThan(15)
  })

  it('la ficha de equipo lista todas las temporadas de la liga', () => {
    const eds = parseEditions(RscDocument.fromHtml(fixture('plantilla-real-madrid-2026')))
    expect(eds.at(-1)?.startYear).toBe(1983)
    expect(eds.length).toBeGreaterThan(40)
  })
})

describe('boxscore', () => {
  const box = parseBoxscore(fixture('boxscore-105375'), '105375')

  it('cabecera, parciales y datos del partido', () => {
    expect(box.status).toBe('finished')
    expect([box.homeScore, box.awayScore]).toEqual([107, 92])
    expect(box.periodScores.reduce((s, q) => s + q.home, 0)).toBe(107)
    expect(box.arena).toBe('Bilbao Arena')
    expect(box.attendance).toBe(8097)
    expect(box.referees).toHaveLength(3)
  })

  it('estadísticas por jugador cuadran con el total del equipo', () => {
    for (const team of box.teams) {
      const full = team.periods.find((p) => p.period === 0)!
      const sum = full.players.reduce((s, l) => s + l.points, 0)
      expect(sum).toBe(full.total.points)
      expect(full.players.filter((l) => l.isStarter)).toHaveLength(5)
      expect(team.periods.map((p) => p.period)).toEqual([0, 1, 2, 3, 4])
    }
    const home = box.teams.find((t) => t.isHome)!
    expect(home.headCoach).toBe('Jaume Ponsarnau')
    const normantas = home.periods[0].players.find((l) => l.player.lastName === 'Normantas')!
    expect(normantas).toMatchObject({ points: 14, seconds: 1262, fg3m: 2, fg3a: 3, pir: 15, plusMinus: 20 })
  })
})

describe('partidos de un equipo (histórico)', () => {
  it('Real Madrid 2025-26: liga regular + playoff', () => {
    const rows = parseTeamSchedule(fixture('partidos-real-madrid-2025'))
    expect(rows.length).toBe(37)
    expect(rows.filter((r) => r.round?.phase === 'regular')).toHaveLength(34)
    expect(rows.filter((r) => r.round?.phase === 'playoff')).toHaveLength(3)
    expect(rows[0]).toMatchObject({ gameRef: { id: '104464' }, round: { number: 1 }, scheduledAt: '2025-10-05T10:30:00Z' })
  })
})

describe('robustez', () => {
  it('lanza ParseError claro si la página no tiene datos', () => {
    expect(() => parseCalendar('<html><body>Mantenimiento</body></html>')).toThrow(ParseError)
    expect(() => parseRoster('<html></html>')).toThrow(/currentRoster/)
  })
})
