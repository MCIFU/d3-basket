/**
 * Parsers de baloncestoenvivo.feb.es (ASP.NET WebForms, HTML clásico).
 * Sirven para todas las competiciones FEB (Primera FEB = g=1, Segunda FEB = g=2...).
 */
import * as cheerio from 'cheerio'
import { dmyToIso, madridToUtc } from '../core/time'
import type {
  CompetitionCode,
  GameStatus,
  NBoxscore,
  NCalendar,
  NClubInfo,
  NCoach,
  NPlayer,
  NPlayerLine,
  NRoster,
  NStatLine,
  NStint,
  NTeam,
  PositionCode
} from '../types'
import { febUrls } from './urls'

export class FebParseError extends Error {
  constructor(page: string, detail: string) {
    super(`[feb:${page}] ${detail} — puede que la web haya cambiado de estructura`)
    this.name = 'FebParseError'
  }
}

type $ = cheerio.CheerioAPI
const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const int = (s: string | undefined) => {
  const n = parseInt(clean(s).replace(/\./g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
const param = (url: string | undefined, key: string) => new RegExp(`[?&]${key}=(\\d+)`, 'i').exec(url ?? '')?.[1]

// ───────────────────────── Nombres y posiciones ─────────────────────────

const LOWER = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'da', 'do', 'dos', 'van', 'der', 'di', 'le'])

/** "AGUILAR HERNANDEZ" → "Aguilar Hernandez" (partículas en minúscula, guiones respetados). */
export function titleCase(s: string): string {
  return clean(s)
    .toLowerCase()
    .split(' ')
    .map((w, i) =>
      i > 0 && LOWER.has(w)
        ? w
        : w
            .split('-')
            .map((p) => p.replace(/^(['´`(]?)(\p{L})/u, (_m, q: string, c: string) => q + c.toUpperCase()))
            .join('-')
    )
    .join(' ')
}

/** "AGUILAR HERNANDEZ, VICTOR" → { first: 'Victor', last: 'Aguilar Hernandez' } */
export function splitName(raw: string): { first?: string; last?: string; full: string } {
  const [last, first] = clean(raw).split(',').map((s) => s.trim())
  if (!first) return { full: titleCase(raw) }
  const f = titleCase(first)
  const l = titleCase(last)
  return { first: f, last: l, full: `${f} ${l}` }
}

const POSITIONS: Record<string, { name: string; code: PositionCode }> = {
  base: { name: 'Base', code: 'PG' },
  escolta: { name: 'Escolta', code: 'SG' },
  alero: { name: 'Alero', code: 'SF' },
  'a-pivot': { name: 'Ala-pívot', code: 'PF' },
  'ala-pivot': { name: 'Ala-pívot', code: 'PF' },
  pivot: { name: 'Pívot', code: 'C' }
}
export function febPosition(v: string | undefined) {
  const key = clean(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  return POSITIONS[key]
}

/** "09/06/1998 Palmas de Gran Canaria, Las (Las Palmas)" → fecha y lugar legibles. */
export function parseBirth(v: string | undefined): { date?: string; place?: string } {
  const text = clean(v)
  const date = dmyToIso(text)
  let place = clean(text.replace(/^\d{1,2}\/\d{1,2}\/\d{4}/, ''))
  // "Palmas de Gran Canaria, Las (Las Palmas)" → "Las Palmas de Gran Canaria (Las Palmas)"
  const m = /^(.+?), (La|Las|El|Los|L')\s*(\(.*\))?$/i.exec(place)
  if (m) place = clean(`${m[2]} ${m[1]} ${m[3] ?? ''}`)
  return { date, place: place || undefined }
}

/** Nombres históricos de una misma categoría → uno solo. */
const COMPETITION_ALIASES: Record<string, string> = {
  ORO: 'LEB ORO',
  PLATA: 'LEB PLATA',
  EBA: 'LIGA EBA',
  BRONCE: 'LEB BRONCE'
}
export const normalizeCompetition = (c: string) => COMPETITION_ALIASES[clean(c).toUpperCase()] ?? clean(c).toUpperCase()

const titleCountry = (v: string | undefined) => (clean(v) ? titleCase(clean(v)) : undefined)

// ───────────────────────── Calendario ─────────────────────────

function teamFrom(cell: cheerio.Cheerio<never>): NTeam | undefined {
  const a = cell.find('a[href*="Equipo.aspx"]').first()
  const id = param(a.attr('href'), 'i')
  if (!id) return undefined
  const name = titleCase(a.text())
  return {
    ref: { source: 'feb', id, url: febUrls.team(id) },
    clubRef: { source: 'feb', id },
    name,
    shortName: name,
    logoUrl: cell.find('img').attr('src') ?? febUrls.logo(id)
  }
}

export interface FebGroups {
  /**
   * Opciones del selector: grupos de liga regular (Segunda FEB: 'A' y 'B') y, en temporadas
   * cerradas, fases finales ('FASE FINAL-A FFA1'...), que no son grupos de la clasificación.
   */
  groups: { value: string; name: string; label: string; regular: boolean }[]
  selected?: string
  /** Campos del formulario ASP.NET para pedir otro grupo por postback. */
  postback: (groupValue: string) => Record<string, string>
}

/** Selector de grupo del calendario: 'Liga Regular "A"' → 'A'. */
export function parseFebGroups(html: string): FebGroups {
  const $ = cheerio.load(html)
  const select = $('select[name$="gruposDropDownList"]').first()
  const groups = select
    .find('option')
    .toArray()
    .map((o) => {
      const label = clean($(o).text())
      return { value: $(o).attr('value') ?? '', name: /"([^"]+)"/.exec(label)?.[1] ?? label, label, regular: /liga regular/i.test(label) }
    })
    .filter((g) => g.value)
  const hidden: Record<string, string> = {}
  for (const input of $('form input[type="hidden"]').toArray()) {
    const n = $(input).attr('name')
    if (n) hidden[n] = $(input).attr('value') ?? ''
  }
  const season = $('select[name$="temporadasDropDownList"]').first()
  const groupField = select.attr('name') ?? ''
  const seasonField = season.attr('name')
  return {
    groups,
    selected: select.find('option[selected]').attr('value') ?? groups[0]?.value,
    postback: (groupValue) => ({
      ...hidden,
      __EVENTTARGET: groupField,
      __EVENTARGUMENT: '',
      ...(seasonField ? { [seasonField]: season.find('option[selected]').attr('value') ?? '' } : {}),
      [groupField]: groupValue
    })
  }
}

export function parseFebCalendar(
  html: string,
  competition: CompetitionCode,
  startYear: number,
  name: string,
  group?: string,
  /** Fase distinta de la liga regular (fases finales): sus jornadas no cuentan para la clasificación. */
  phase?: { id: string; name: string }
): NCalendar {
  const $ = cheerio.load(html)
  const rounds = $('div.columna').toArray()
  if (!rounds.length) throw new FebParseError('calendario', 'no se encontraron jornadas')
  const teams = new Map<string, NTeam>()
  const games: NCalendar['games'] = []
  rounds.forEach((col, i) => {
    const title = clean($(col).find('h1').first().text())
    const number = int(/Jornada\s+(\d+)/i.exec(title)?.[1]) || i + 1
    const roundDate = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(title)?.[1]
    for (const tr of $(col).find('tr').toArray()) {
      const tds = $(tr).find('td').toArray()
      if (tds.length < 3) continue
      const home = teamFrom($(tds[0]) as never)
      const away = teamFrom($(tds[2]) as never)
      const mid = $(tds[1])
      const link = mid.find('a[href*="Partido.aspx"]').attr('href')
      const gameId = param(link, 'p')
      if (!home || !away || !gameId) continue
      if (group) home.group = away.group = group
      teams.set(home.ref.id, home)
      teams.set(away.ref.id, away)
      const text = clean(mid.text())
      const score = /^(\d+)\s*-\s*(\d+)$/.exec(text)
      const when = /(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}:\d{2})?/.exec(mid.html()?.replace(/<br\s*\/?>/gi, ' ') ?? '')
      const status: GameStatus = score ? 'finished' : when || roundDate ? 'scheduled' : 'unscheduled'
      games.push({
        ref: { source: 'feb', id: gameId, url: febUrls.game(gameId) },
        round: phase ? { phase: phase.id, number, name: `${phase.name} · Jornada ${number}` } : { phase: 'regular', number, name: `Jornada ${number}` },
        homeTeam: home,
        awayTeam: away,
        scheduledAt: when ? madridToUtc(when[1], when[2]) : roundDate ? madridToUtc(roundDate) : undefined,
        status,
        homeScore: score ? Number(score[1]) : undefined,
        awayScore: score ? Number(score[2]) : undefined
      })
    }
  })
  if (!games.length) throw new FebParseError('calendario', 'no se encontraron partidos')
  return {
    edition: { ref: { source: 'feb', id: `${competition}-${startYear}` }, competition, startYear, name, isCurrent: true },
    teams: [...teams.values()],
    games
  }
}

// ───────────────────────── Equipo (plantilla + club) ─────────────────────────

const byId = ($: $, suffix: string) => clean($(`[id$="_${suffix}"]`).first().text())

export function parseFebTeam(html: string, teamId: string): NRoster & { club: NClubInfo; teamName?: string } {
  const $ = cheerio.load(html)
  const table = $('table')
    .toArray()
    .find((t) => /Nombre/.test($(t).find('tr').first().text()) && /Puesto/.test($(t).find('tr').first().text()))
  if (!table) throw new FebParseError('equipo', `plantilla no encontrada (${teamId})`)
  const header = $(table)
    .find('tr')
    .first()
    .find('th,td')
    .toArray()
    .map((c) => clean($(c).text()).toLowerCase())
  const col = (name: string) => header.findIndex((h) => h.startsWith(name))

  const players = $(table)
    .find('tr')
    .toArray()
    .slice(1)
    .flatMap((tr) => {
      const tds = $(tr).find('td').toArray()
      // Cada fila tiene dos enlaces al jugador (foto y nombre): nos quedamos con el del nombre.
      const links = $(tr).find('a[href*="Jugador.aspx"]')
      const link = links.filter((_, a) => clean($(a).text()) !== '').first()
      const personId = param(links.first().attr('href'), 'c')
      if (!personId) return []
      const pos = febPosition($(tds[col('puesto')]).text())
      const birth = parseBirth($(tds[col('nacimiento')]).text())
      const height = int($(tds[col('altura')]).text())
      const weight = int($(tds[col('peso')]).text())
      const formation = clean($(tds[col('formación')]).text()).toUpperCase()
      const full = titleCase(link.text())
      const player: NPlayer = {
        ref: { source: 'feb', id: personId, url: febUrls.player(teamId, personId) },
        fullName: full,
        position: pos?.name,
        positionCode: pos?.code,
        birthDate: birth.date,
        birthPlace: birth.place,
        nationality: titleCountry($(tds[col('nacionalidad')]).text()),
        heightCm: height > 100 ? height : undefined,
        photoUrl: febUrls.photo(personId),
        photoNobgUrl: febUrls.photo(personId)
      }
      void weight
      return [
        {
          player,
          jerseyNumber: clean($(tds[col('dorsal')]).text()) || undefined,
          position: pos?.name,
          positionCode: pos?.code,
          licenseType: formation === 'SI' ? 'JFL' : formation === 'NO' ? 'NO-JFL' : undefined,
          isActive: true
        }
      ]
    })

  // Entrenador: foto + nombre en el bloque "Entrenador".
  const coachImg = $('[id$="_fotoEntrenadorImage"]').attr('src')
  const coachId = param(coachImg, 'c')
  const coachBlock = $('[id$="_fotoEntrenadorImage"]').closest('div').parent()
  const coachName = clean(
    coachBlock
      .text()
      .replace(/Entrenador/i, '')
      .replace(/\d{1,2}\/\d{1,2}\/\d{4}.*/, '')
  )
  const staff: NCoach[] =
    coachId && coachName
      ? [{ ref: { source: 'feb', id: coachId }, fullName: titleCase(coachName), photoUrl: febUrls.photo(coachId), role: 'head_coach' }]
      : []

  const web = clean($('[id$="_webAnchor"]').first().text()) || undefined
  const jersey = $('[id$="_camiseta_titular_principal"]').attr('fill')
  return {
    players,
    staff,
    teamName: titleCase(clean($('.titulo').first().text())) || undefined,
    club: {
      clubRef: { source: 'feb', id: teamId },
      arena: titleCase(byId($, 'pabellonLabel')) || undefined,
      arenaAddress: byId($, 'dirPabellonLabel') || undefined,
      website: web,
      president: titleCase(byId($, 'presidenteLabel')) || undefined,
      logoUrl: febUrls.logo(teamId),
      primaryColor: jersey && /^#[0-9a-f]{6}$/i.test(jersey) ? jersey : undefined,
      socials: {}
    }
  }
}

// ───────────────────────── Partido ─────────────────────────

function statLine(cells: string[]): NStatLine {
  const [made2, att2] = cells[5].split(/\s/)[0].split('/').map(int)
  const [made3, att3] = cells[6].split(/\s/)[0].split('/').map(int)
  const [madeFt, attFt] = cells[8].split(/\s/)[0].split('/').map(int)
  const mins = /(\d+):(\d+)/.exec(cells[3])
  return {
    seconds: mins ? Number(mins[1]) * 60 + Number(mins[2]) : 0,
    points: int(cells[4]),
    fg2m: made2,
    fg2a: att2,
    fg3m: made3,
    fg3a: att3,
    ftm: madeFt,
    fta: attFt,
    oreb: int(cells[9]),
    dreb: int(cells[10]),
    reb: int(cells[11]),
    ast: int(cells[12]),
    stl: int(cells[13]),
    tov: int(cells[14]),
    blk: int(cells[15]),
    blkAgainst: int(cells[16]),
    dunks: int(cells[17]),
    pf: int(cells[18]),
    foulsDrawn: int(cells[19]),
    pir: int(cells[20]),
    plusMinus: cells[21] !== undefined && clean(cells[21]) !== '' ? int(cells[21]) : undefined
  }
}

export function parseFebBoxscore(html: string, gameId: string): NBoxscore {
  const $ = cheerio.load(html)
  const homeA = $('[id$="_equipoLocalHyperLink"]').first()
  const awayA = $('[id$="_equipoVisitanteHyperLink"]').first()
  const homeId = param(homeA.attr('href'), 'i')
  const awayId = param(awayA.attr('href'), 'i')
  if (!homeId || !awayId) throw new FebParseError('partido', `equipos no encontrados (${gameId})`)
  const team = (id: string, name: string): NTeam => ({
    ref: { source: 'feb', id, url: febUrls.team(id) },
    clubRef: { source: 'feb', id },
    name: titleCase(name),
    shortName: titleCase(name),
    logoUrl: febUrls.logo(id)
  })
  const homeTeam = team(homeId, homeA.text())
  const awayTeam = team(awayId, awayA.text())
  const homeScore = int($('.equipo.local .resultado').first().text())
  const awayScore = int($('.equipo.visitante .resultado').first().text())

  const periodScores = $('.box-cuartos .nodo')
    .toArray()
    .flatMap((n, i) => {
      const m = /(\d+)\s*\/\s*(\d+)/.exec($(n).find('.marcador').text())
      return m ? [{ period: i + 1, home: Number(m[1]), away: Number(m[2]) }] : []
    })
  const fecha = clean($('.box-datos-partido .fecha .txt').text())
  const when = /(\d{1,2}\/\d{1,2}\/\d{4})\s*-?\s*(\d{1,2}:\d{2})?/.exec(fecha)
  const referees = $('.txt.referee')
    .toArray()
    .map((r) => splitName($(r).text()).full)
    .filter(Boolean)
  const arena = titleCase(clean($('.box-datos-partido .pista .txt').first().text())) || undefined

  const tables = $('table')
    .toArray()
    .filter((t) => $(t).find('td.nombre.jugador, td.puntos').length > 0)
  const teams = tables.map((t) => {
    const rows = $(t).find('tr').toArray()
    const firstLink = $(t).find('a[href*="Jugador.aspx"]').first().attr('href')
    const tid = param(firstLink, 'i') ?? (tables.indexOf(t) === 0 ? homeId : awayId)
    const isHome = tid === homeId
    const players: NPlayerLine[] = []
    let total: NStatLine | undefined
    for (const tr of rows) {
      const cells = $(tr)
        .find('td')
        .toArray()
        .map((c) => clean($(c).text()))
      if (cells.length < 21) continue
      const link = $(tr).find('a[href*="Jugador.aspx"]').first()
      const personId = param(link.attr('href'), 'c')
      if (personId) {
        const n = splitName(link.text() || cells[2])
        players.push({
          ...statLine(cells),
          player: {
            ref: { source: 'feb', id: personId, url: febUrls.player(tid, personId) },
            firstName: n.first,
            lastName: n.last,
            fullName: n.full,
            photoUrl: febUrls.photo(personId),
            photoNobgUrl: febUrls.photo(personId)
          },
          jerseyNumber: cells[1] || undefined,
          isStarter: cells[0].includes('*')
        })
      } else if (/200:00|\d{3}:\d{2}/.test(cells[3]) || (!cells[2] && int(cells[4]) > 0)) {
        total = statLine(cells)
      }
    }
    const sum = (k: keyof NStatLine) => players.reduce((a, p) => a + (Number(p[k]) || 0), 0)
    const computed = total ?? (Object.fromEntries(Object.keys(players[0] ?? {}).map((k) => [k, sum(k as keyof NStatLine)])) as unknown as NStatLine)
    return {
      team: isHome ? homeTeam : awayTeam,
      isHome,
      headCoach: undefined,
      assistantCoaches: [],
      periods: [
        {
          period: 0,
          players,
          total: computed,
          // Acciones de equipo = total oficial − suma de jugadores.
          teamOnly: {
            oreb: Math.max(0, computed.oreb - sum('oreb')),
            dreb: Math.max(0, computed.dreb - sum('dreb')),
            tov: Math.max(0, computed.tov - sum('tov'))
          }
        }
      ]
    }
  })
  const played = teams.some((t) => t.periods[0].players.some((p) => p.seconds > 0))
  return {
    gameRef: { source: 'feb', id: gameId, url: febUrls.game(gameId) },
    scheduledAt: when ? madridToUtc(when[1], when[2]) : undefined,
    status: played ? 'finished' : 'scheduled',
    homeTeam,
    awayTeam,
    homeScore: played ? homeScore : undefined,
    awayScore: played ? awayScore : undefined,
    periodScores,
    arena,
    referees,
    teams: played ? teams : []
  }
}

// ───────────────────────── Jugador ─────────────────────────

export function parseFebPlayer(html: string, personId: string): { player: NPlayer; stints: NStint[] } {
  const $ = cheerio.load(html)
  const rawName = clean($('.nombre').first().text())
  if (!rawName) throw new FebParseError('jugador', `ficha sin nombre (${personId})`)
  const n = splitName(rawName)
  const field = (label: string) =>
    clean(
      $('.nodo')
        .toArray()
        .find((nodo) => clean($(nodo).find('.label').text()).toLowerCase() === label)
        ? $(
            $('.nodo')
              .toArray()
              .find((nodo) => clean($(nodo).find('.label').text()).toLowerCase() === label)!
          )
            .find('.string')
            .text()
        : ''
    )
  const pos = febPosition(field('puesto'))
  const birth = parseBirth(field('fecha nacimiento'))
  const height = int(field('altura'))

  const table = $('[id$="_trayectoriaDataGrid"]').first()
  const stints: NStint[] = table
    .find('tr')
    .toArray()
    .slice(1)
    .flatMap((tr) => {
      const c = $(tr)
        .find('td')
        .toArray()
        .map((x) => clean($(x).text()))
      const season = /(\d{2})\/(\d{2})/.exec(c[0] ?? '')
      if (!season) return []
      const yy = Number(season[1])
      const clubTeam = /^(.*?)\s*\[(.*)\]\s*$/.exec(c[2] ?? '')
      return [
        {
          seasonStartYear: yy >= 50 ? 1900 + yy : 2000 + yy,
          competition: normalizeCompetition(c[1] ?? ''),
          club: titleCase(clubTeam ? clubTeam[1] : (c[2] ?? '')),
          team: clubTeam ? titleCase(clubTeam[2]) : undefined,
          license: c[3] || undefined,
          joinedOn: dmyToIso(c[4]),
          leftOn: dmyToIso(c[5])
        }
      ]
    })

  return {
    player: {
      ref: { source: 'feb', id: personId },
      firstName: n.first,
      lastName: n.last,
      fullName: n.full,
      position: pos?.name,
      positionCode: pos?.code,
      birthDate: birth.date,
      birthPlace: birth.place,
      nationality: titleCountry(field('nacionalidad')),
      heightCm: height > 100 ? height : undefined,
      photoUrl: febUrls.photo(personId),
      photoNobgUrl: febUrls.photo(personId)
    },
    stints
  }
}
