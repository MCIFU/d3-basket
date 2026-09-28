/**
 * Adaptador que da a sql.js (SQLite en WebAssembly) la misma forma que
 * better-sqlite3, para reutilizar `Queries` tal cual en el navegador.
 */
import type { Database, SqlValue } from 'sql.js'
import type { SqlDb, SqlStatement } from '../../../db/queries'

const norm = (v: unknown): SqlValue =>
  v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlValue)

/** Parámetros posicionales (?, ?) o con nombre ({ a: 1 } → @a), como better-sqlite3. */
function bindParams(params: unknown[]): SqlValue[] | Record<string, SqlValue> {
  const [first] = params
  if (params.length === 1 && first && typeof first === 'object' && !Array.isArray(first)) {
    const out: Record<string, SqlValue> = {}
    for (const [k, v] of Object.entries(first)) out[`@${k}`] = norm(v)
    return out
  }
  return params.map(norm)
}

export function wrapSqlJs(db: Database): SqlDb {
  return {
    prepare(sql: string): SqlStatement {
      return {
        all: (...params) => {
          const stmt = db.prepare(sql)
          try {
            stmt.bind(bindParams(params))
            const rows: unknown[] = []
            while (stmt.step()) rows.push(stmt.getAsObject())
            return rows
          } finally {
            stmt.free()
          }
        },
        get: (...params) => {
          const stmt = db.prepare(sql)
          try {
            stmt.bind(bindParams(params))
            return stmt.step() ? stmt.getAsObject() : undefined
          } finally {
            stmt.free()
          }
        },
        run: (...params) => {
          db.run(sql, bindParams(params))
          const changes = db.getRowsModified()
          const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0]
          return { lastInsertRowid: Number(id ?? 0), changes }
        }
      }
    },
    transaction<T>(fn: () => T) {
      return () => {
        db.exec('BEGIN')
        try {
          const result = fn()
          db.exec('COMMIT')
          return result
        } catch (err) {
          db.exec('ROLLBACK')
          throw err
        }
      }
    }
  }
}
