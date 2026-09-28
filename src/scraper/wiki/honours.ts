/**
 * Palmarés histórico (campeón y subcampeón por temporada) desde Wikipedia en
 * español, CC BY-SA 4.0. Se usa porque acb.com solo publica el recuento de
 * títulos (cuadro de honor), no los años.
 *
 * Los clubes se identifican por el título del artículo enlazado, que es estable
 * aunque cambie el nombre comercial ("TAU Cerámica", "Caja Laboral"... → Saski Baskonia).
 */
import * as cheerio from 'cheerio'

export type HonourCompetition = 'liga' | 'copa' | 'supercopa'

export interface NHonour {
  competition: HonourCompetition
  seasonStartYear: number
  label: string // '2025-26' (liga) o '2026' (copa/supercopa)
  championName: string
  championArticle?: string
  runnerUpName?: string
  runnerUpArticle?: string
  result?: string
  note?: string
}

export const WIKI_PAGES: Record<HonourCompetition, string> = {
  liga: 'Liga_ACB',
  copa: 'Copa_del_Rey_de_Baloncesto',
  supercopa: 'Supercopa_de_España_de_Baloncesto'
}

export const wikiApiUrl = (page: string) =>
  `https://es.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&redirects=1`

/**
 * Artículo de Wikipedia → id de club en acb.com (cuadro de honor / ranking de clubes).
 * Solo clubes con títulos o finales; el resto se muestra sin enlace.
 */
export const WIKI_CLUB_TO_ACB: Record<string, string> = {
  'Real Madrid Baloncesto': '9',
  'Real Madrid de Baloncesto': '9',
  'Fútbol Club Barcelona (baloncesto)': '2',
  'Club Joventut de Badalona': '8',
  'Club Joventut Badalona': '8',
  'Saski Baskonia': '3',
  'Club Baloncesto Málaga': '14',
  'Unicaja Málaga': '14',
  'Valencia Basket': '13',
  'Bàsquet Manresa': '10',
  'Club Baloncesto Estudiantes': '6',
  'Real Betis Baloncesto': '15',
  'UCAM Murcia Club de Baloncesto': '12',
  'Club Baloncesto Canarias': '28',
  'Club Baloncesto Gran Canaria': '5',
  'Bilbao Basket': '4',
  'Club Basket Bilbao Berri': '4',
  'Basket Zaragoza 2002': '16',
  'Club Baloncesto Zaragoza': '115',
  'Club Baloncesto Breogán': '25',
  'Club Baloncesto Valladolid': '71',
  'Club Baloncesto Peñas Huesca': '40',
  'Club Baloncesto Granada': '1',
  'Baloncesto Fuenlabrada': '17',
  'Bàsquet Club Andorra': '22',
  'Club Bàsquet Andorra': '22',
  'Bàsquet Girona': '591',
  'Obradoiro Club de Amigos del Baloncesto': '57',
  'Club Estudiantes de Baloncesto': '6',
  'Club Baloncesto Murcia': '12',
  'Club Baloncesto Sevilla': '15'
}

const clean = (s: string) =>
  s
    .replace(/\[[^\]]*\]/g, '') // notas [1]
    .replace(/[​ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Primer enlace de la celda que no sea una bandera: el artículo del club. */
function clubCell($: cheerio.CheerioAPI, cell: cheerio.Cheerio<never>) {
  const link = cell
    .find('a[title]')
    .toArray()
    .map((a) => $(a).attr('title') ?? '')
    .find((t) => t && !/^Bandera|^Archivo:|^File:/i.test(t))
  // "Saski Baskonia (7.º)" / "Real Madrid (1)" → sin el contador de títulos.
  const name = clean(cell.text()).replace(/\s*\(\d+\.?º?\)$/, '')
  return { name, article: link?.replace(/ \(aún no redactado\)$/, '') }
}

function seasonFrom(text: string, competition: HonourCompetition): { start: number; label: string } | undefined {
  const t = clean(text)
  const range = /(\d{4})\s*[–-]\s*(\d{2,4})/.exec(t)
  if (range) {
    const start = Number(range[1])
    return { start, label: `${start}-${String(start + 1).slice(-2)}` }
  }
  const year = /(\d{4})/.exec(t)
  if (!year) return undefined
  const y = Number(year[1])
  // La Copa se juega en febrero (temporada que empezó el año anterior);
  // la Supercopa abre la temporada en septiembre/octubre.
  return { start: competition === 'copa' ? y - 1 : y, label: String(y) }
}

export function parseWikiHonours(html: string, competition: HonourCompetition): NHonour[] {
  const $ = cheerio.load(html)
  const out: NHonour[] = []
  for (const table of $('table').toArray()) {
    const rows = $(table).find('tr').toArray()
    const header = $(rows[0])
      .find('th,td')
      .toArray()
      .map((c) => clean($(c).text()).toLowerCase())
    const iChamp = header.findIndex((h) => h === 'campeón' || h.startsWith('campeón'))
    const iRunner = header.findIndex((h) => h.startsWith('subcampeón'))
    const iSeason = header.findIndex((h) => h.startsWith('temporada') || h === 'año' || h.startsWith('edición') || h === 'fecha')
    if (iChamp < 0 || iRunner < 0 || iSeason < 0 || rows.length < 10) continue
    const iResult = header.findIndex((h) => h.startsWith('res'))
    const iNote = header.findIndex((h) => h.startsWith('nota'))

    for (const row of rows.slice(1)) {
      const cells = $(row).find('th,td').toArray()
      if (cells.length < Math.max(iChamp, iRunner) + 1) continue // fila de sección
      const season = seasonFrom($(cells[iSeason]).text(), competition)
      const champ = clubCell($, $(cells[iChamp]) as never)
      if (!season || !champ.name || /^[-–—]$/.test(champ.name)) continue
      const runner = clubCell($, $(cells[iRunner]) as never)
      const note = iNote >= 0 && cells[iNote] ? clean($(cells[iNote]).text()) : ''
      if (/no oficial|suspendid|cancelad/i.test(note)) continue
      out.push({
        competition,
        seasonStartYear: season.start,
        label: season.label,
        championName: champ.name,
        championArticle: champ.article,
        runnerUpName: runner.name && !/^[-–—]$/.test(runner.name) ? runner.name : undefined,
        runnerUpArticle: runner.article,
        result: iResult >= 0 && cells[iResult] ? clean($(cells[iResult]).text()) || undefined : undefined,
        note: note || undefined
      })
    }
    if (out.length) break // la primera tabla válida es el historial
  }
  // Una entrada por temporada (la última gana si hay duplicados).
  return [...new Map(out.map((h) => [`${h.competition}-${h.seasonStartYear}`, h])).values()]
}

export function parseWikiApiResponse(json: string, competition: HonourCompetition): NHonour[] {
  const data = JSON.parse(json) as { parse?: { text?: { '*': string } } }
  const html = data.parse?.text?.['*']
  if (!html) throw new Error(`Wikipedia: respuesta sin contenido para ${competition}`)
  return parseWikiHonours(html, competition)
}

/** Club (id acb) → artículo de Wikipedia, para el resumen de historia de la ficha del club. */
export const ACB_CLUB_TO_WIKI: Record<string, string> = {
  '9': 'Real Madrid Baloncesto',
  '2': 'Fútbol Club Barcelona (baloncesto)',
  '8': 'Club Joventut Badalona',
  '3': 'Saski Baskonia',
  '14': 'Club Baloncesto Málaga',
  '13': 'Valencia Basket',
  '10': 'Bàsquet Manresa',
  '12': 'UCAM Murcia Club de Baloncesto',
  '28': 'Club Baloncesto Canarias',
  '4': 'Bilbao Basket',
  '16': 'Basket Zaragoza 2002',
  '25': 'Club Baloncesto Breogán',
  '57': 'Obradoiro Club de Amigos del Baloncesto',
  '22': 'Bàsquet Club Andorra',
  '591': 'Bàsquet Girona',
  '658': 'Força Lleida Club Esportiu',
  '657': 'Club Basquet Coruña',
  '549': 'Club Baloncesto San Pablo Burgos',
  '5': 'Club Baloncesto Gran Canaria',
  '6': 'Club Estudiantes de Baloncesto'
}

export const wikiSummaryUrl = (article: string) =>
  `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article.replace(/ /g, '_'))}`

/** Resumen (primer párrafo) de un artículo, desde la API REST de Wikipedia. */
export function parseWikiSummary(json: string): { title: string; extract: string; url?: string } | undefined {
  const j = JSON.parse(json) as { type?: string; title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }
  if (j.type !== 'standard' || !j.extract) return undefined
  return { title: j.title ?? '', extract: j.extract.trim(), url: j.content_urls?.desktop?.page }
}
