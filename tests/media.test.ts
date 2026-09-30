import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database'
import { applyMedia } from '../src/db/media'
import { Queries } from '../src/db/queries'
import { Writer } from '../src/db/writer'
import { parseCalendar } from '../src/scraper/acb/parsers'
import { zoneOf, LEAGUES } from '../src/shared/leagues'

const fixture = (name: string) =>
  zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'acb', `${name}.html.gz`))).toString('utf8')

describe('recursos gráficos propios (public/media)', () => {
  it('sustituye escudo y colores del club y conserva los datos del resto', () => {
    const db = openDatabase(':memory:')
    const w = new Writer(db)
    const cal = parseCalendar(fixture('calendario-2026'))
    cal.edition.isCurrent = true
    const csId = w.upsertEdition(cal.edition)
    for (const t of cal.teams) w.upsertTeam(csId, t, { updateClubName: true })
    const ref = (db.prepare('SELECT ref FROM v_club_ref LIMIT 1').get() as { ref: string }).ref

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3media-'))
    fs.mkdirSync(path.join(dir, 'logos'))
    fs.writeFileSync(path.join(dir, 'logos', `${ref}.png`), '')
    fs.writeFileSync(path.join(dir, 'logos', 'no-existe.png'), '')
    fs.writeFileSync(path.join(dir, 'colors.json'), JSON.stringify({ [ref]: { primary: '#112233', secondary: '#ffcc00' } }))

    expect(applyMedia(db, dir)).toMatchObject({ logos: 1, colors: 1 })
    const club = new Queries(db).club(ref)!.club
    expect(club).toMatchObject({ logo: `media/logos/${ref}.png`, color: '#112233', color2: '#ffcc00' })
    const team = new Queries(db).standings(csId).find((s) => s.club_ref === ref)!
    expect(team.logo).toBe(`media/logos/${ref}.png`)
    // Sin partidos: todos los equipos aparecen igualmente en la clasificación.
    expect(new Queries(db).standings(csId)).toHaveLength(18)
    expect(applyMedia(db, path.join(dir, 'no-hay'))).toEqual({ players: 0, logos: 0, colors: 0 })
  })
})

describe('zonas de clasificación', () => {
  it('cuenta las posiciones negativas desde el final', () => {
    const acb = LEAGUES.ACB.zones
    expect(zoneOf(acb, 1, 18)?.kind).toBe('playoff')
    expect(zoneOf(acb, 8, 18)?.kind).toBe('playoff')
    expect(zoneOf(acb, 9, 18)).toBeUndefined()
    expect(zoneOf(acb, 17, 18)?.kind).toBe('down')
    expect(zoneOf(LEAGUES.LEB_ORO.zones, 1, 18)?.kind).toBe('up')
  })
})

describe('fichas duplicadas de un mismo jugador', () => {
  it('une ACB + FEB por nacimiento y apellido, y dos ids FEB con el mismo nombre', () => {
    const db = openDatabase(':memory:')
    const w = new Writer(db)
    const acb = w.upsertPlayer({ ref: { source: 'acb', id: '30001' }, fullName: 'Sergio Pérez López', lastName: 'Pérez López', birthDate: '2000-01-01' })
    const feb = w.upsertPlayer({ ref: { source: 'feb', id: '900' }, fullName: 'Sergio Perez Lopez' })
    db.prepare('UPDATE players SET birth_date = ? WHERE id = ?').run('2000-01-01', feb)
    const febA = w.upsertPlayer({ ref: { source: 'feb', id: '700' }, fullName: 'Ana Ruiz Gil' })
    const febB = w.upsertPlayer({ ref: { source: 'feb', id: '701' }, fullName: 'Ana Ruiz Gil' })
    db.prepare('UPDATE players SET birth_date = ? WHERE id IN (?, ?)').run('1999-05-05', febA, febB)
    // Otra persona con la misma fecha y otro apellido no se toca.
    const other = w.upsertPlayer({ ref: { source: 'feb', id: '800' }, fullName: 'Luis Gómez Sanz' })
    db.prepare('UPDATE players SET birth_date = ? WHERE id = ?').run('2000-01-01', other)

    expect(w.dedupePlayers()).toBe(2)
    const n = (id: number) => (db.prepare('SELECT COUNT(*) AS n FROM players WHERE id = ?').get(id) as { n: number }).n
    expect([n(acb), n(feb), n(other)]).toEqual([1, 0, 1])
    expect(n(febA) + n(febB)).toBe(1)
    expect((db.prepare(`SELECT COUNT(*) AS n FROM external_ids WHERE entity_type = 'player' AND entity_id = ?`).get(acb) as { n: number }).n).toBe(2)
    // La ref estable sigue siendo la de acb.com, y hay una sola por jugador.
    expect((db.prepare('SELECT ref FROM v_player_ref WHERE player_id = ?').get(acb) as { ref: string }).ref).toBe('30001')
    expect((db.prepare('SELECT COUNT(*) AS n FROM v_player_ref').get() as { n: number }).n).toBe(3)
  })
})
