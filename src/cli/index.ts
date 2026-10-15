/**
 * CLI del scraper de D3 Basket.
 *
 *   npm run scrape -- sync acb                      temporada actual completa
 *   npm run scrape -- sync acb --season 2025        histórico 2025-26 (experimental)
 *   npm run scrape -- sync acb --no-players --max-boxscores 5
 *   npm run scrape -- sync primera-feb              Primera FEB (LEB Oro) en curso
 *   npm run scrape -- editions acb                  temporadas disponibles en acb.com
 *   npm run scrape -- info                          resumen de la base de datos
 *   npm run scrape -- export-web [salida.db.gz]     publica los datos para la versión web
 *
 * Opciones comunes: --db <ruta>  --cache  --delay <ms>
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { defaultDbPath, openDatabase } from '../db/database'
import { runChecks } from '../db/check'
import { applyMedia } from '../db/media'
import { Writer } from '../db/writer'
import { HttpClient } from '../scraper/core/http'
import { AcbScraper } from '../scraper/acb/sync'
import { FebScraper } from '../scraper/feb/sync'
import { EuroleagueScraper, type EuroCompetition } from '../scraper/euroleague/sync'
import { FibaScraper } from '../scraper/fiba/sync'
import { syncLeague, type LeagueAdapter } from '../scraper/europe/league'
import { LbaAdapter } from '../scraper/europe/lba'
import { BblAdapter } from '../scraper/europe/bbl'
import { LnbAdapter } from '../scraper/europe/lnb'
import { LnpAdapter } from '../scraper/europe/lnp'
import { EsakeAdapter } from '../scraper/europe/esake'
import { ProaAdapter } from '../scraper/europe/proa'
import { SofascoreAdapter } from '../scraper/europe/sofascore'
import type { FebCompetition } from '../scraper/feb/urls'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: 'string' },
    season: { type: 'string' },
    cache: { type: 'boolean', default: false },
    delay: { type: 'string', default: '1000' },
    force: { type: 'boolean', default: false },
    'no-rosters': { type: 'boolean', default: false },
    'no-players': { type: 'boolean', default: false },
    'no-boxscores': { type: 'boolean', default: false },
    'no-history': { type: 'boolean', default: false },
    'no-careers': { type: 'boolean', default: false },
    'career-budget': { type: 'string', default: '250' },
    'max-boxscores': { type: 'string' },
    'player-max-age': { type: 'string', default: '30' },
    'max-bios': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false }
  }
})

const [command, league] = positionals
const log = (msg: string) => console.log(msg)

function usage(code = 0): never {
  console.log(`Uso:
  npm run scrape -- sync acb [--season 2025] [--no-rosters] [--no-players] [--no-boxscores]
                             [--max-boxscores N] [--force] [--player-max-age DÍAS]
                             [--no-history] [--no-careers] [--career-budget N]
  npm run scrape -- sync primera-feb [--season 2026]   (LEB Oro; también segunda-feb, tercera-feb y copa-espana)
  npm run scrape -- editions acb
  npm run scrape -- info
  npm run scrape -- restore-db [seed/d3basket.db.gz]   (build: semilla → caché → web)
  npm run scrape -- export-web [public/data/d3basket.db.gz]
  npm run scrape -- check                              (auditoría de integridad de los datos)
  npm run scrape -- import-club-wiki tools/media/club-wiki.json   (fundación e historia de clubes FEB)

Opciones: --db <ruta.db> (por defecto ${defaultDbPath()})
          --cache  guarda el HTML crudo en ./data/cache (depuración)
          --delay <ms> pausa entre peticiones (por defecto 1000)`)
  process.exit(code)
}

async function main() {
  if (values.help || !command) usage()
  const dbPath = values.db ? path.resolve(values.db) : defaultDbPath()
  if (command === 'restore-db') {
    await restoreDb(dbPath, positionals[1] ?? path.join('seed', 'd3basket.db.gz'))
    return
  }
  const db = openDatabase(dbPath)
  process.on('exit', () => db.open && db.close()) // cierra y vuelca el WAL al fichero principal
  console.log(`Base de datos: ${dbPath}`)

  if (command === 'check') {
    let errors = 0
    for (const c of runChecks(db)) {
      const mark = !c.rows.length ? '✔' : c.level === 'error' ? '✗' : '⚠'
      console.log(`${mark} ${c.title}${c.rows.length ? ` (${c.rows.length})` : ''}`)
      if (c.rows.length) console.table(c.rows.slice(0, 15))
      if (c.level === 'error') errors += c.rows.length
    }
    process.exitCode = errors ? 1 : 0
    return
  }

  if (command === 'import-club-wiki') {
    // Emparejamientos club ↔ Wikipedia revisados (tools/media/club_wiki.py): solo rellena lo que falte.
    type Extra = { website?: string; socials?: Record<string, string>; city?: string; arena?: string; arena_capacity?: number }
    type Entry = { ok: boolean; match: { founded: number | null; extract: string | null; url: string | null; extra?: Extra } | null }
    const entries = JSON.parse(fs.readFileSync(path.resolve(positionals[1] ?? 'tools/media/club-wiki.json'), 'utf8')) as Record<string, Entry>
    const clubId = db.prepare(
      `SELECT COALESCE((SELECT club_id FROM v_club_ref WHERE ref = @ref),
         -- El club puede haber cambiado de ref al unirse a su ficha ACB: se busca por su id FEB.
         (SELECT entity_id FROM external_ids WHERE entity_type = 'club' AND source = 'feb' AND 'f' || external_id = @ref)) AS id`
    )
    const update = db.prepare(
      `UPDATE clubs SET founded_year = COALESCE(founded_year, @founded), history = COALESCE(history, @history),
         history_url = COALESCE(history_url, @url), city = COALESCE(city, @city),
         website = CASE WHEN website LIKE '%.%' AND website NOT LIKE '% %' THEN website ELSE COALESCE(@website, website) END
       WHERE id = @id`
    )
    const getClub = db.prepare('SELECT arena, arena_capacity, socials FROM clubs WHERE id = ?')
    const setSocials = db.prepare('UPDATE clubs SET socials = ? WHERE id = ?')
    const setCapacity = db.prepare('UPDATE clubs SET arena_capacity = ? WHERE id = ? AND arena_capacity IS NULL')
    const words = (s: string) => new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/^(pabellon|palacio|deportes|municipal|polideportivo|pavello)$/.test(w)))
    let n = 0
    db.transaction(() => {
      for (const [ref, e] of Object.entries(entries)) {
        if (!e.ok || !e.match) continue
        const id = (clubId.get({ ref }) as { id: number | null }).id
        if (!id) continue
        const x = e.match.extra ?? {}
        n += update.run({ id, founded: e.match.founded, history: e.match.extract, url: e.match.url, city: x.city ?? null, website: x.website ?? null }).changes
        const club = getClub.get(id) as { arena: string | null; arena_capacity: number | null; socials: string | null }
        if (x.socials) setSocials.run(JSON.stringify({ ...x.socials, ...(club.socials ? JSON.parse(club.socials) : {}) }), id)
        // El aforo de Wikidata solo si es el mismo pabellón en el que juega ahora.
        if (x.arena_capacity && x.arena && club.arena && [...words(x.arena)].some((w) => words(club.arena!).has(w))) setCapacity.run(x.arena_capacity, id)
      }
    })()
    console.log(`✔ ${n} clubes completados con Wikipedia/Wikidata (fundación, historia, ciudad, web, redes y aforo)`)
    return
  }

  if (command === 'export-web') {
    // Copia compacta y comprimida para la web, sin datos privados (informes de scouting).
    const out = path.resolve(positionals[1] ?? path.join('public', 'data', 'd3basket.db.gz'))
    const tmp = `${out}.tmp.db`
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.rmSync(tmp, { force: true })
    db.prepare('VACUUM INTO ?').run(tmp)
    const copy = new Database(tmp)
    copy.exec('DELETE FROM scouting_ratings; DELETE FROM scouting_reports; DELETE FROM scrape_runs;')
    // La web solo usa los totales de cada partido: sin las estadísticas por cuarto pesa ~40 % menos.
    // La semilla (ruta explícita) las conserva completas.
    if (!positionals[1]) copy.exec('DELETE FROM player_game_stats WHERE period > 0; DELETE FROM team_game_stats WHERE period > 0;')
    // Fotos, escudos y colores procesados (public/media) en lugar de los originales.
    const media = applyMedia(copy, path.resolve('public', 'media'))
    console.log(`  media: ${media.players} fotos, ${media.logos} escudos, ${media.colors} paletas de club`)
    // Marca de la exportación: permite saber si una base de datos en caché procede de esta semilla.
    copy.prepare("INSERT INTO app_meta (key, value) VALUES ('export_id', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
      new Date().toISOString()
    )
    copy.pragma('journal_mode = DELETE')
    copy.exec('VACUUM')
    copy.close()
    const raw = fs.readFileSync(tmp)
    fs.writeFileSync(out, zlib.gzipSync(raw, { level: 9 }))
    fs.rmSync(tmp, { force: true })
    const kb = (n: number) => `${Math.round(n / 1024)} KB`
    console.log(`✔ Datos web exportados: ${out} (${kb(raw.length)} → ${kb(fs.statSync(out).size)} gzip)`)
    return
  }

  if (command === 'info') {
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
    for (const t of ['competition_seasons', 'clubs', 'teams', 'players', 'roster_entries', 'games', 'player_game_stats', 'scouting_reports']) {
      console.log(`  ${t.padEnd(22)} ${count(t)}`)
    }
    const runs = db
      .prepare('SELECT id, scope, started_at, status, requests FROM scrape_runs ORDER BY id DESC LIMIT 5')
      .all()
    console.table(runs)
    return
  }

  const FEB_ALIASES: Record<string, FebCompetition> = {
    'primera-feb': 'LEB_ORO',
    'leb-oro': 'LEB_ORO',
    'segunda-feb': 'LEB_PLATA',
    'leb-plata': 'LEB_PLATA',
    'tercera-feb': 'TERCERA_FEB',
    'copa-espana': 'COPA_ESPANA',
    'cesa-inf-m': 'CESA_INF_M',
    'cesa-inf-f': 'CESA_INF_F',
    'cesa-cad-m': 'CESA_CAD_M',
    'cesa-cad-f': 'CESA_CAD_F',
    'ce-jun-m': 'CE_JUN_M',
    'ce-jun-f': 'CE_JUN_F',
    'ce-cad-m': 'CE_CAD_M',
    'ce-cad-f': 'CE_CAD_F',
    'ce-inf-m': 'CE_INF_M',
    'ce-inf-f': 'CE_INF_F'
  }
  const febCompetition = league ? FEB_ALIASES[league.toLowerCase()] : undefined
  const EURO_ALIASES: Record<string, EuroCompetition> = { euroleague: 'EUROLEAGUE', euroliga: 'EUROLEAGUE', eurocup: 'EUROCUP' }
  const euroCompetition = league ? EURO_ALIASES[league.toLowerCase()] : undefined
  const isBcl = !!league && ['bcl', 'champions', 'champions-league'].includes(league.toLowerCase())
  const NATIONAL: Record<string, (http: HttpClient) => LeagueAdapter> = {
    lba: (h) => new LbaAdapter(h),
    'serie-a': (h) => new LbaAdapter(h),
    bbl: (h) => new BblAdapter(h),
    'serie-a2': (h) => new LnpAdapter(h),
    gbl: (h) => new EsakeAdapter(h),
    proa: (h) => new ProaAdapter(h),
    bsl: (h) => new SofascoreAdapter(h, 519, 'BSL', 'Basketbol Süper Ligi'),
    turquia: (h) => new SofascoreAdapter(h, 519, 'BSL', 'Basketbol Süper Ligi'),
    grecia: (h) => new EsakeAdapter(h),
    a2: (h) => new LnpAdapter(h),
    'betclic-elite': (h) => new LnbAdapter(h, 1, 'LNB_ELITE'),
    elite: (h) => new LnbAdapter(h, 1, 'LNB_ELITE'),
    'elite-2': (h) => new LnbAdapter(h, 2, 'LNB_ELITE2'),
    'pro-b': (h) => new LnbAdapter(h, 2, 'LNB_ELITE2')
  }
  const national = league ? NATIONAL[league.toLowerCase()] : undefined
  if (league !== 'acb' && !febCompetition && !euroCompetition && !isBcl && !national) {
    console.error(`Liga no soportada: ${league ?? '(ninguna)'} — usa "acb", "primera-feb", "segunda-feb", "tercera-feb" o "copa-espana".`)
    usage(1)
  }

  const http = new HttpClient({
    minDelayMs: Number(values.delay),
    cacheDir: values.cache ? path.resolve('data', 'cache') : undefined,
    cacheTtlMs: values.cache ? 6 * 3600_000 : 0,
    log
  })
  const acb = new AcbScraper(db, http)

  if (command === 'editions') {
    const eds = await acb.listEditions()
    for (const e of eds) console.log(`  ${e.startYear}-${e.startYear + 1}  editionId=${e.ref.id}  ${e.name}`)
    return
  }

  if (command === 'sync') {
    const opts = {
      rosters: !values['no-rosters'],
      players: !values['no-players'],
      boxscores: !values['no-boxscores'],
      history: !values['no-history'],
      careers: !values['no-careers'],
      careerBudget: Number(values['career-budget']),
      force: values.force,
      maxBoxscores: values['max-boxscores'] ? Number(values['max-boxscores']) : undefined,
      playerMaxAgeDays: Number(values['player-max-age']),
      maxPlayerBios: values['max-bios'] ? Number(values['max-bios']) : undefined,
      log
    }
    const t0 = Date.now()
    const summary = national
      ? await syncLeague(db, http, national(http), { ...opts, season: values.season ? Number(values.season) : undefined })
      : isBcl
      ? await new FibaScraper(db, http).sync({ ...opts, season: values.season ? Number(values.season) : undefined })
      : euroCompetition
      ? await new EuroleagueScraper(db, http).sync(euroCompetition, { ...opts, season: values.season ? Number(values.season) : undefined })
      : febCompetition
      ? await new FebScraper(db, http).sync(febCompetition, { ...opts, season: values.season ? Number(values.season) : undefined })
      : values.season
        ? await acb.syncHistoric(Number(values.season), opts)
        : await acb.syncCurrent(opts)
    const fused = new Writer(db).mergeDuplicateGames()
    if (fused) console.log(`  ${fused} partidos duplicados fundidos con el original`)
    const merged = new Writer(db).dedupePlayers()
    if (merged) console.log(`  ${merged} jugadores unificados (misma persona en acb.com y en la FEB)`)
    const secs = Math.round((Date.now() - t0) / 1000)
    console.log(`\n✔ ${summary.edition} sincronizada en ${secs}s (${summary.requests} peticiones)`)
    console.log(
      `  equipos ${summary.teams} · partidos ${summary.games} · plantillas ${summary.rosters} · ` +
        `jugadores ${summary.players} · fichas ${summary.playerBios} · boxscores ${summary.boxscores} · ` +
        `temporadas de trayectoria ${summary.careerSeasons}${summary.history ? ' · historia actualizada' : ''}`
    )
    if (summary.errors.length) {
      console.log(`  ⚠ ${summary.errors.length} errores no fatales:`)
      for (const e of summary.errors.slice(0, 10)) console.log(`    - ${e.url ?? ''} ${e.error}`)
    }
    return
  }

  usage(1)
}

/**
 * Prepara la base de datos de trabajo del build (Netlify):
 *  - si hay una semilla nueva (exportada en local con la carga histórica completa), se usa;
 *  - si no, se conserva la de la caché de builds;
 *  - y si tampoco hay caché, se descarga la publicada en la propia web.
 */
async function restoreDb(dbPath: string, seedPath: string) {
  const meta = (file: string, key: string) => {
    try {
      const d = new Database(file, { readonly: true })
      const v = (d.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined)?.value
      d.close()
      return v
    } catch {
      return undefined
    }
  }
  const install = (gz: Buffer, origin: string) => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true })
    fs.writeFileSync(dbPath, gz[0] === 0x1f && gz[1] === 0x8b ? zlib.gunzipSync(gz) : gz)
    const d = new Database(dbPath)
    d.prepare("INSERT INTO app_meta (key, value) VALUES ('seed_origin', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(origin)
    d.close()
  }

  if (fs.existsSync(seedPath)) {
    const tmp = `${dbPath}.seed-check.db`
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.writeFileSync(tmp, zlib.gunzipSync(fs.readFileSync(seedPath)))
    const seedId = meta(tmp, 'export_id') ?? 'sin-id'
    fs.rmSync(tmp, { force: true })
    if (!fs.existsSync(dbPath) || meta(dbPath, 'seed_origin') !== seedId) {
      install(fs.readFileSync(seedPath), seedId)
      console.log(`✔ Base de datos restaurada desde la semilla ${seedPath} (${seedId})`)
      return
    }
  }
  if (fs.existsSync(dbPath)) {
    console.log('✔ Se conserva la base de datos de la caché de builds')
    return
  }
  const site = process.env.URL
  if (site) {
    try {
      const res = await fetch(`${site.replace(/\/$/, '')}/data/d3basket.db.gz`)
      if (res.ok) {
        install(Buffer.from(await res.arrayBuffer()), 'web')
        console.log(`✔ Base de datos descargada de ${site}`)
        return
      }
    } catch (err) {
      console.log(`  No se pudo descargar la base de datos publicada: ${err}`)
    }
  }
  console.log('  Sin semilla ni caché: se hará una sincronización completa')
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
