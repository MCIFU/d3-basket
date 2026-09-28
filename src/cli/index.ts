/**
 * CLI del scraper de D3 Basket.
 *
 *   npm run scrape -- sync acb                      temporada actual completa
 *   npm run scrape -- sync acb --season 2025        histórico 2025-26 (experimental)
 *   npm run scrape -- sync acb --no-players --max-boxscores 5
 *   npm run scrape -- editions acb                  temporadas disponibles en acb.com
 *   npm run scrape -- info                          resumen de la base de datos
 *
 * Opciones comunes: --db <ruta>  --cache  --delay <ms>
 */
import path from 'node:path'
import { parseArgs } from 'node:util'
import { defaultDbPath, openDatabase } from '../db/database'
import { HttpClient } from '../scraper/core/http'
import { AcbScraper } from '../scraper/acb/sync'

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
  npm run scrape -- editions acb
  npm run scrape -- info

Opciones: --db <ruta.db> (por defecto ${defaultDbPath()})
          --cache  guarda el HTML crudo en ./data/cache (depuración)
          --delay <ms> pausa entre peticiones (por defecto 1000)`)
  process.exit(code)
}

async function main() {
  if (values.help || !command) usage()
  const dbPath = values.db ? path.resolve(values.db) : defaultDbPath()
  const db = openDatabase(dbPath)
  console.log(`Base de datos: ${dbPath}`)

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

  if (league !== 'acb') {
    console.error(`Liga no soportada todavía: ${league ?? '(ninguna)'} — de momento solo "acb".`)
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
      force: values.force,
      maxBoxscores: values['max-boxscores'] ? Number(values['max-boxscores']) : undefined,
      playerMaxAgeDays: Number(values['player-max-age']),
      log
    }
    const t0 = Date.now()
    const summary = values.season
      ? await acb.syncHistoric(Number(values.season), opts)
      : await acb.syncCurrent(opts)
    const secs = Math.round((Date.now() - t0) / 1000)
    console.log(`\n✔ ${summary.edition} sincronizada en ${secs}s (${summary.requests} peticiones)`)
    console.log(
      `  equipos ${summary.teams} · partidos ${summary.games} · plantillas ${summary.rosters} · ` +
        `jugadores ${summary.players} · fichas ${summary.playerBios} · boxscores ${summary.boxscores}`
    )
    if (summary.errors.length) {
      console.log(`  ⚠ ${summary.errors.length} errores no fatales:`)
      for (const e of summary.errors.slice(0, 10)) console.log(`    - ${e.url ?? ''} ${e.error}`)
    }
    return
  }

  usage(1)
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
