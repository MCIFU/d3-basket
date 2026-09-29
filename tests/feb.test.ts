import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database'
import { Queries } from '../src/db/queries'
import { Writer } from '../src/db/writer'
import { madridToUtc } from '../src/scraper/core/time'
import { linkFebClubs } from '../src/scraper/feb/sync'
import { parseFebBoxscore, parseFebCalendar, parseFebGroups, parseFebPlayer, parseFebTeam, splitName, titleCase } from '../src/scraper/feb/parsers'

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

describe('Segunda FEB (liga por grupos)', () => {
  it('detecta los grupos y prepara el postback del grupo B', () => {
    const html = feb('cal-plata')
    const info = parseFebGroups(html)
    expect(info.groups).toMatchObject([
      { value: '89999', name: 'A', regular: true },
      { value: '90000', name: 'B', regular: true }
    ])
    expect(info.selected).toBe('89999')
    const form = info.postback('90000')
    expect(form.__EVENTTARGET).toMatch(/gruposDropDownList$/)
    expect(form.__VIEWSTATE).toBeTruthy()
    expect(Object.entries(form).find(([k]) => k.endsWith('gruposDropDownList'))?.[1]).toBe('90000')
    expect(Object.entries(form).find(([k]) => k.endsWith('temporadasDropDownList'))?.[1]).toBe('2026')

    const cal = parseFebCalendar(html, 'LEB_PLATA', 2026, 'Segunda FEB 2026-27', 'A')
    expect(cal.teams).toHaveLength(14)
    expect(cal.teams.every((t) => t.group === 'A')).toBe(true)
  })

  it('Primera FEB no tiene grupos', () => {
    expect(parseFebGroups(feb('cal')).groups.length).toBeLessThanOrEqual(1)
  })
})

describe('Tercera FEB 2025-26 (temporada cerrada)', () => {
  it('distingue los 10 grupos de liga regular de las fases finales', () => {
    const html = feb('cal-tercera-2025')
    const info = parseFebGroups(html)
    expect(info.groups.filter((g) => g.regular).map((g) => g.name)).toEqual(['C-B', 'A-A', 'A-B', 'B-A', 'B-B', 'C-A', 'D-A', 'D-B', 'E-A', 'E-B'])
    expect(info.groups.filter((g) => !g.regular)).toHaveLength(6)
    // La página por defecto es una fase final: sus partidos van a la fase 'final', no a la liga regular.
    const final = parseFebCalendar(html, 'TERCERA_FEB', 2025, 'Tercera FEB 2025-26', undefined, { id: 'final', name: 'Fase final' })
    expect(final.games.length).toBeGreaterThan(0)
    expect(final.games.every((g) => g.round?.phase === 'final' && !!g.round.name?.startsWith('Fase final'))).toBe(true)
    expect(final.teams.every((t) => t.group === undefined)).toBe(true)
  })
})

describe('un mismo club FEB en varias temporadas', () => {
  const team = (id: string, name: string) => ({ ref: { source: 'feb' as const, id }, clubRef: { source: 'feb' as const, id }, name })
  function setup() {
    const db = openDatabase(':memory:')
    const w = new Writer(db)
    const edition = (competition: 'LEB_ORO' | 'TERCERA_FEB', startYear: number) =>
      w.upsertEdition({ ref: { source: 'feb', id: `${competition}-${startYear}` }, competition, startYear })
    const add = (cs: number, id: string, name: string, arena: string) => {
      w.upsertTeam(cs, team(id, name))
      w.updateClubInfo({ clubRef: { source: 'feb', id }, arena, socials: {} })
    }
    return { db, edition, add }
  }
  const clubOf = (db: ReturnType<typeof openDatabase>, id: string) =>
    (db.prepare(`SELECT entity_id FROM external_ids WHERE entity_type = 'club' AND source = 'feb' AND external_id = ?`).get(id) as { entity_id: number }).entity_id

  it('une el club por pabellón y nombre, y no une los filiales', () => {
    const { db, edition, add } = setup()
    const oro26 = edition('LEB_ORO', 2026)
    add(oro26, '100', 'Grupo Alega Cantabria', 'Pabellón Vicente Trueba')
    add(oro26, '101', 'Hla Alicante', 'Centro de Tecnificación')
    const oro25 = edition('LEB_ORO', 2025)
    add(oro25, '50', 'Alega Cantabria CBT', 'Pabellon Vicente Trueba')
    add(oro25, '51', 'Hla Alicante', 'Centro de Tecnificación')
    add(oro25, '52', 'Otro Club Distinto', 'Pabellón Vicente Trueba')
    expect(linkFebClubs(db, oro25)).toBe(2)
    expect(clubOf(db, '50')).toBe(clubOf(db, '100'))
    expect(clubOf(db, '51')).toBe(clubOf(db, '101'))
    expect(clubOf(db, '52')).not.toBe(clubOf(db, '100')) // mismo pabellón pero nombre sin nada en común

    // El filial del HLA Alicante en Tercera esa misma temporada no se une al primer equipo.
    const tercera25 = edition('TERCERA_FEB', 2025)
    add(tercera25, '60', 'Hla Alicante', 'Centro de Tecnificación')
    expect(linkFebClubs(db, tercera25)).toBe(0)
    expect(clubOf(db, '60')).not.toBe(clubOf(db, '101'))
    // La referencia estable del club es la de su id FEB más reciente.
    expect((db.prepare('SELECT ref FROM v_club_ref WHERE club_id = ?').get(clubOf(db, '100')) as { ref: string }).ref).toBe('f100')
  })
})
