/**
 * Comprueba las fotos oficiales (acb.com y FEB) de todos los jugadores y apunta
 * en public/media/photos-dead.txt las que no sirven: vacías, que no son imagen o
 * que son la silueta genérica que sirven ambas webs cuando no hay foto.
 * src/db/media.ts quita esas URL de la base de datos: sin foto oficial, sin foto.
 *
 *   node tools/media/check_photos.mjs [--db data/d3basket.db] [--all]
 *   (--all vuelve a comprobar también las ya marcadas como válidas)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const args = process.argv.slice(2)
const dbPath = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'data/d3basket.db'
const dir = path.dirname(new URL(import.meta.url).pathname)
const DEAD = path.join(dir, '..', '..', 'public', 'media', 'photos-dead.txt')
const OK = path.join(dir, 'photos-ok.txt')
const read = (f) => new Set(fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [])
const dead = read(DEAD)
const ok = args.includes('--all') ? new Set() : read(OK)

const db = new Database(dbPath, { readonly: true })
const urls = new Set()
for (const r of db.prepare('SELECT photo_url a, photo_nobg_url b, body_photo_url c FROM players').all())
  for (const u of [r.a, r.b, r.c]) if (u && /^https?:/.test(u)) urls.add(u)
const todo = [...urls].filter((u) => !dead.has(u) && !ok.has(u))
console.log(`${urls.size} URL distintas, ${todo.length} por comprobar`)

// Una misma imagen repetida en muchos jugadores distintos es la silueta genérica.
const byHash = new Map()
let done = 0
async function check(u) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'D3Basket/0.1 (scouting personal; +https://github.com/MCIFU/d3-basket)' } })
      if (res.status === 404 || res.status === 410) return { u, bad: 'http ' + res.status }
      if (!res.ok) throw new Error('http ' + res.status)
      const buf = Buffer.from(await res.arrayBuffer())
      const type = res.headers.get('content-type') ?? ''
      if (!buf.length) return { u, bad: 'vacía' }
      if (!type.startsWith('image/') || buf.length < 1500) return { u, bad: `no es imagen (${type}, ${buf.length} B)` }
      return { u, hash: crypto.createHash('md5').update(buf).digest('hex') }
    } catch (e) {
      if (i === 3) return { u, error: String(e) }
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
}
const results = []
let next = 0
await Promise.all(
  Array.from({ length: 10 }, async () => {
    while (next < todo.length) {
      const r = await check(todo[next++])
      results.push(r)
      if (++done % 250 === 0) console.log(`  ${done}/${todo.length}`)
    }
  })
)
for (const r of results) if (r.hash) byHash.set(r.hash, [...(byHash.get(r.hash) ?? []), r.u])
const generic = new Set([...byHash.values()].filter((l) => l.length >= 3).flat())
let nDead = 0, nOk = 0, nErr = 0
for (const r of results) {
  if (r.error) nErr++
  else if (r.bad || generic.has(r.u)) (dead.add(r.u), nDead++)
  else (ok.add(r.u), nOk++)
}
fs.writeFileSync(DEAD, [...dead].sort().join('\n') + '\n')
fs.writeFileSync(OK, [...ok].sort().join('\n') + '\n')
console.log(`✔ válidas ${nOk} · sin foto ${nDead} (genéricas ${generic.size}) · errores de red ${nErr} (se reintentan la próxima vez)`)
