import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database'
import { Queries } from '../src/db/queries'
import { Writer } from '../src/db/writer'
import {
  parseCalendar,
  parseClubRanking,
  parseHonoursBoard,
  parsePlayerProfile,
  parsePlayerSeasonGames,
  parseRoster
} from '../src/scraper/acb/parsers'
import { WIKI_CLUB_TO_ACB, parseWikiApiResponse } from '../src/scraper/wiki/honours'

const gz = (...p: string[]) => zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', ...p))).toString('utf8')
const acb = (name: string) => gz('acb', `${name}.html.gz`)
const wiki = (name: string) => gz('wiki', `${name}.json.gz`)

describe('ficha de club y jugador (datos ampliados)', () => {
  it('la plantilla trae pabellón, fundación y redes del club', () => {
    const club = parseRoster(acb('plantilla-real-madrid-2026')).club!
    expect(club).toMatchObject({ clubRef: { id: '9' }, foundedYear: 1902, arena: 'Movistar Arena', arenaCapacity: 13109 })
    expect(club.socials.instagram).toContain('realmadridbasket')
  })

  it('la ficha de jugador trae foto sin fondo, temporadas, carrera y récords', () => {
    const p = parsePlayerProfile(acb('jugador-llull'))
    expect(p.photoNobgUrl).toMatch(/transparent\.webp$/)
    expect(p.editions).toContain('80')
    expect(p.career.acbTotals).toMatchObject({ games: 697, points: 7014 })
    expect(p.career.records.points.value).toBeGreaterThan(20)
  })

  it('partidos de un jugador en una temporada pasada', () => {
    const rows = parsePlayerSeasonGames(acb('partidos-llull-2015'))
    expect(rows).toHaveLength(42)
    expect(rows.every((r) => r.team.clubId === '9')).toBe(true)
    expect(rows[0]).toMatchObject({ gameRef: '16219', points: 11, seconds: 28 * 60 + 36, isHome: true, won: false })
    expect(rows.filter((r) => r.roundType === 'PO').length).toBeGreaterThan(0)
  })
})

describe('historia', () => {
  it('clasificación histórica y cuadro de honor', () => {
    const ranking = parseClubRanking(acb('ranking-de-clubes'))
    expect(ranking[0]).toMatchObject({ name: 'Real Madrid', position: 1 })
    expect(ranking[0].games).toBeGreaterThan(2000)
    const board = parseHonoursBoard(acb('cuadro-de-honor'))
    expect(board.acb.find((r) => r.clubRef.id === '2')?.firstPlaces).toBe(17)
    expect(board.total.length).toBeGreaterThan(50)
  })

  it('palmarés de Wikipedia con años y clubes identificables', () => {
    const liga = parseWikiApiResponse(wiki('Liga_ACB'), 'liga')
    expect(liga.find((h) => h.seasonStartYear === 2025)).toMatchObject({ label: '2025-26', championName: 'Valencia Basket' })
    // Títulos de la era ACB de Barça y Real Madrid.
    const acbEra = liga.filter((h) => h.seasonStartYear >= 1983)
    expect(acbEra.filter((h) => WIKI_CLUB_TO_ACB[h.championArticle!] === '2')).toHaveLength(17)
    expect(acbEra.filter((h) => WIKI_CLUB_TO_ACB[h.championArticle!] === '9')).toHaveLength(16)
    // Todas las finales de la era ACB se enlazan con un club.
    expect(acbEra.every((h) => WIKI_CLUB_TO_ACB[h.championArticle!])).toBe(true)

    const copa = parseWikiApiResponse(wiki('Copa_del_Rey_de_Baloncesto'), 'copa')
    expect(copa.find((h) => h.label === '2026')).toMatchObject({ championName: 'Saski Baskonia', seasonStartYear: 2025 })
    const supercopa = parseWikiApiResponse(wiki('Supercopa_de_Espana_de_Baloncesto'), 'supercopa')
    expect(supercopa.length).toBeGreaterThan(20)
  })
})

describe('consultas de las fichas', () => {
  it('club y jugador con palmarés, récords y trayectoria', () => {
    const db = openDatabase(':memory:')
    const w = new Writer(db)
    const cal = parseCalendar(acb('calendario-2026'))
    const csId = w.upsertEdition(cal.edition)
    for (const t of cal.teams) w.upsertTeam(csId, t, { updateClubName: true })
    const roster = parseRoster(acb('plantilla-real-madrid-2026'))
    const teamId = w.findId('team', { source: 'acb', id: '4476' })!
    for (const e of roster.players) w.upsertRosterEntry(teamId, w.upsertPlayer(e.player), e)
    w.updateClubInfo(roster.club!)
    w.saveClubRecords('acb', parseClubRanking(acb('ranking-de-clubes')))
    w.saveHonours('liga', parseWikiApiResponse(wiki('Liga_ACB'), 'liga'), (a) => (a ? WIKI_CLUB_TO_ACB[a] : undefined))
    const profile = parsePlayerProfile(acb('jugador-llull'))
    const llull = w.upsertPlayer(profile, { bio: true })
    w.savePlayerProfileExtras(llull, profile)
    w.savePlayerSeason(llull, 2015, '80', parsePlayerSeasonGames(acb('partidos-llull-2015')))

    const q = new Queries(db)
    const club = q.club('9')!
    expect(club.club).toMatchObject({ name: 'Real Madrid', founded_year: 1902, arena: 'Movistar Arena' })
    expect(club.roster).toHaveLength(15)
    expect(club.honours.filter((h) => h.role === 'champion' && h.competition === 'liga').length).toBe(38)

    const player = q.player('20201774')!
    expect(player.current?.name).toBe('Real Madrid')
    expect(player.career?.acbTotals?.points).toBe(7014)
    expect(player.trajectory.find((t) => t.start_year === 2015)).toMatchObject({ team_name: 'Real Madrid', games: 42 })

    const league = q.league('ACB')!
    expect(league.honours.length).toBeGreaterThan(60)
    expect(league.alltime[0].name).toBe('Real Madrid')
  })
})
