import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrations } from './migrations'

export type DB = Database.Database

/**
 * Ruta por defecto de la base de datos, compartida por la app Electron y la CLI
 * del scraper para que ambas vean los mismos datos.
 *   Windows: %APPDATA%\D3Basket\d3basket.db
 *   macOS:   ~/Library/Application Support/D3Basket/d3basket.db
 *   Linux:   ~/.config/D3Basket/d3basket.db
 * Se puede sobrescribir con la variable de entorno D3_DB_PATH.
 */
export function defaultDbPath(): string {
  if (process.env.D3_DB_PATH) return path.resolve(process.env.D3_DB_PATH)
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
  return path.join(base, 'D3Basket', 'd3basket.db')
}

export function openDatabase(file: string = defaultDbPath()): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}

export function migrate(db: DB): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`)
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => (r as { version: number }).version)
  )
  let count = 0
  for (const m of migrations) {
    if (applied.has(m.version)) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
    })()
    count++
  }
  return count
}
