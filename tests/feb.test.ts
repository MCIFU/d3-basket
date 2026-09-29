import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database'
import { Queries } from '../src/db/queries'
import { Writer } from '../src/db/writer'
import { madridToUtc } from '../src/scraper/core/time'
import { parseFebBoxscore, parseFebCalendar, parseFebPlayer, parseFebTeam, splitName, titleCase } from '../src/scraper/feb/parsers'

// Copias reales de baloncestoenvivo.feb.es (Primera FEB 2026-27, jornada 1).
const feb = (name: string) => zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'feb', `${name}.html.gz`))).toString('utf8')

describe('utilidades FEB', () => {
  it('nombres, horas de Madrid y lugares', () => {
    expect(splitName('AGUILAR HERNANDEZ, VICTOR')).toMatchObject({ first: 'Victor', last: 'Aguilar Hernandez' })
    expect(titleCase('PABELLÓN DE LA CIUDAD (palencia)')).toBe('Pabellón de la Ciudad (Palencia)')
    expect(madridToUtc('26/09/2026', '19:00')).toBe('2026-09-26T17:00:00Z') // verano: UTC+2
    expect(madridToUtc('15/01/2027', '19:00')).toBe('2027-01-15T18:00:00Z') // invierno: UTC+1
  })
})

describe('Primera FEB', () => {
  it('calendario completo con resultados de la jornada 1', () => {
    const cal = parseFebCalendar(feb('cal'), 'LEB_ORO', 2026, 'Primera FEB 2026-27')
    expect(cal.teams).toHaveLength(18)
    expect(cal.games).toHaveLength(306)
    const first = cal.games.find((g) => g.ref.id === '2535725')!
    expect(first).toMatchObject({ status: 'finished', homeScore: 69, awayScore: 95, round: { number: 1 } })
    expect(first.homeTeam.name).toBe('Bueno Arenas Albacete Basket')
    expect(cal.games.filter((g) => g.status === 'scheduled').length).toBe(297)
  })

  it('plantilla con datos personales, fotos sin fondo y club', () => {
    const t = parseFebTeam(feb('team'), '1009716')
    expect(t.players).toHaveLength(10)
    const p = t.players.find((x) => x.player.ref.id === '1371559')!
    expect(p.player).toMatchObject({ fullName: 'Victor Aguilar Hernandez', birthDate: '1998-06-09', heightCm: 185, position: 'Base' })
    expect(p.player.photoNobgUrl).toContain('imagenes.feb.es')
    expect(t.staff[0]).toMatchObject({ fullName: 'David Varela Gallego', role: 'head_coach' })
    expect(t.club).toMatchObject({ arena: 'Pabellón del Parque', primaryColor: '#228B22' })
  })

  it('boxscore: cuadra con el marcador y trae parciales, fecha y árbitros', () => {
    const b = parseFebBoxscore(feb('game'), '2535725')
    expect([b.homeScore, b.awayScore]).toEqual([69, 95])
    expect(b.scheduledAt).toBe('2026-09-26T17:00:00Z')
    expect(b.periodScores.reduce((s, q) => s + q.home, 0)).toBe(69)
    expect(b.referees).toHaveLength(3)
    for (const t of b.teams) {
      const full = t.periods[0]
      expect(full.players.reduce((s, l) => s + l.points, 0)).toBe(full.total.points)
      expect(full.players.filter((l) => l.isStarter)).toHaveLength(5)
    }
  })

  it('ficha de jugador con trayectoria completa en todas las categorías', () => {
    const { player, stints } = parseFebPlayer(feb('player'), '1371559')
    expect(player).toMatchObject({ fullName: 'Victor Aguilar Hernandez', nationality: 'España' })
    expect(stints.length).toBeGreaterThanOrEqual(10)
    expect(stints[0]).toMatchObject({ seasonStartYear: 2016, competition: 'LIGA EBA' })
    expect(stints.at(-1)).toMatchObject({ seasonStartYear: 2026, competition: 'PRIMERA FEB' })
  })

  it('se guarda y se consulta como cualquier liga', () => {
    const db = openDatabase(':memory:')
    const w = new Writer(db)
    const cal = parseFebCalendar(feb('cal'), 'LEB_ORO', 2026, 'Primera FEB 2026-27')
    const csId = w.upsertEdition(cal.edition)
    const ids = new Map(cal.teams.map((t) => [t.ref.id, w.upsertTeam(csId, t)]))
    for (const g of cal.games) w.upsertGame(csId, g, ids.get(g.homeTeam.ref.id)!, ids.get(g.awayTeam.ref.id)!)
    const roster = parseFebTeam(feb('team'), '1009716')
    for (const e of roster.players) w.upsertRosterEntry(ids.get('1009716')!, w.upsertPlayer(e.player), e)
    w.updateClubInfo(roster.club)
    w.saveBoxscore(csId, parseFebBoxscore(feb('game'), '2535725'))
    const { player, stints } = parseFebPlayer(feb('player'), '1371559')
    w.savePlayerStints(w.upsertPlayer(player, { bio: true }), 'feb', stints)

    const q = new Queries(db)
    const league = q.league('LEB_ORO')!
    expect(league.standings).toHaveLength(18)
    expect(league.playerStats.length).toBeGreaterThan(15)
    const p = q.player('f1371559')!
    expect(p.player.display_name).toBe('Victor Aguilar Hernandez')
    expect(p.stints.length).toBeGreaterThanOrEqual(10)
    expect(p.trajectory[0]).toMatchObject({ competition_code: 'LEB_ORO', games: 1 })
    expect(q.club('f1009716')?.club.arena).toBe('Pabellón del Parque')
  })
})
