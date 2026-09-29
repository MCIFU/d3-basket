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
import { HttpClient } from '../scraper/core/http'
import { AcbScraper } from '../scraper/acb/sync'
import { FebScraper } from '../scraper/feb/sync'
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
  npm run scrape -- sync primera-feb [--season 2026]   (LEB Oro; también segunda-feb)
  npm run scrape -- editions acb
  npm run scrape -- info
  npm run scrape -- restore-db [seed/d3basket.db.gz]   (build: semilla → caché → web)
  npm run scrape -- export-web [data/web/data/d3basket.db.gz]

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

  if (command === 'export-web') {
    // Copia compacta y comprimida para la web, sin datos privados (informes de scouting).
    const out = path.resolve(positionals[1] ?? path.join('data', 'web', 'data', 'd3basket.db.gz'))
    const tmp = `${out}.tmp.db`
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.rmSync(tmp, { force: true })
    db.prepare('VACUUM INTO ?').run(tmp)
    const copy = new Database(tmp)
    copy.exec('DELETE FROM scouting_ratings; DELETE FROM scouting_reports; DELETE FROM scrape_runs;')
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
    'leb-plata': 'LEB_PLATA'
  }
  const febCompetition = league ? FEB_ALIASES[league.toLowerCase()] : undefined
  if (league !== 'acb' && !febCompetition) {
    console.error(`Liga no soportada: ${league ?? '(ninguna)'} — usa "acb", "primera-feb" o "segunda-feb".`)
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
      log
    }
    const t0 = Date.now()
    const summary = febCompetition
      ? await new FebScraper(db, http).sync(febCompetition, { ...opts, season: values.season ? Number(values.season) : undefined })
      : values.season
        ? await acb.syncHistoric(Number(values.season), opts)
        : await acb.syncCurrent(opts)
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
