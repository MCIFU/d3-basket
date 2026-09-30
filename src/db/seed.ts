import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/**
 * Primer arranque de la app de escritorio: si todavía no hay base de datos, se instala
 * la semilla que viaja con el instalador (todas las temporadas ya descargadas), así la
 * app se abre con datos sin esperar horas de sincronización. Devuelve true si la instaló.
 */
export function installSeedIfMissing(dbPath: string, seedPath: string): boolean {
  if (fs.existsSync(dbPath) || !fs.existsSync(seedPath)) return false
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const gz = fs.readFileSync(seedPath)
  const tmp = `${dbPath}.tmp`
  fs.writeFileSync(tmp, gz[0] === 0x1f && gz[1] === 0x8b ? zlib.gunzipSync(gz) : gz)
  fs.renameSync(tmp, dbPath)
  return true
}
