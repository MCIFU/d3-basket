import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database'
import { Writer } from '../src/db/writer'
import { parseBoxscore, parseCalendar, parseRoster } from '../src/scraper/acb/parsers'

const fixture = (name: string) =>
  zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'acb', `${name}.html.gz`))).toString('utf8')

function seed() {
  const db = openDatabase(':memory:')
  const w = new Writer(db)
  const cal = parseCalendar(fixture('calendario-2026'))
  const csId = w.upsertEdition(cal.edition)
  const ids = new Map(cal.teams.map((t) => [t.ref.id, w.upsertTeam(csId, t, { updateClubName: true })]))
  for (const g of cal.games) w.upsertGame(csId, g, ids.get(g.homeTeam.ref.id)!, ids.get(g.awayTeam.ref.id)!)
  return { db, w, cal, csId }
}

describe('esquema y escritura', () => {
  it('aplica migraciones y siembra las cuatro competiciones', () => {
    const db = openDatabase(':memory:')
    const codes = db.prepare('SELECT code FROM competitions ORDER BY tier').all().map((r: any) => r.code)
    expect(codes).toEqual(['ACB', 'LEB_ORO', 'LEB_PLATA', 'TERCERA_FEB'])
  })

  it('guardar el calendario dos veces no duplica nada (idempotente)', () => {
    const { db, w, cal, csId } = seed()
    const ids = new Map(cal.teams.map((t) => [t.ref.id, w.upsertTeam(csId, t)]))
    for (const g of cal.games) w.upsertGame(csId, g, ids.get(g.homeTeam.ref.id)!, ids.get(g.awayTeam.ref.id)!)
    const n = (t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n
    expect(n('teams')).toBe(18)
    expect(n('clubs')).toBe(18)
    expect(n('games')).toBe(306)
    expect(n('rounds')).toBe(34)
  })

  it('boxscore + plantilla alimentan la vista de medias y la clasificación', () => {
    const { db, w, csId } = seed()
    w.saveBoxscore(csId, parseBoxscore(fixture('boxscore-105375'), '105375'))

    const roster = parseRoster(fixture('plantilla-real-madrid-2026'))
    const rm = w.findId('team', { source: 'acb', id: '4476' })!
    for (const e of roster.players) w.upsertRosterEntry(rm, w.upsertPlayer(e.player), e)

    const normantas = db
      .prepare(`SELECT * FROM v_player_season_stats WHERE full_name LIKE '%Normantas%'`)
      .get() as any
    expect(normantas).toMatchObject({ games: 1, ppg: 14 })

    const standings = db
      .prepare('SELECT team_name, won, lost, diff FROM v_standings WHERE competition_season_id = ? ORDER BY diff DESC')
      .all(csId) as any[]
    expect(standings[0]).toMatchObject({ team_name: 'Barça', won: 1, diff: 18 })
    expect(standings).toHaveLength(18)

    // Re-guardar el boxscore reemplaza, no duplica.
    w.saveBoxscore(csId, parseBoxscore(fixture('boxscore-105375'), '105375'))
    const lines = db.prepare('SELECT COUNT(*) n FROM player_game_stats WHERE period = 0').get() as any
    expect(lines.n).toBeGreaterThan(20)
    expect(lines.n).toBeLessThan(30)
  })
})
