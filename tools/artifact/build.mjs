/**
 * Versión de D3 Basket para abrir dentro de Claude (artifact), en móvil o en el PC.
 *
 *   npm run build:artifact            → dist-artifact/ (página + ficheros a publicar)
 *
 * El visor de Claude admite unos cientos de ficheros por página y solo imágenes propias,
 * así que las fotos de jugadores y los escudos se empaquetan en ~130 ficheros (con extensión .webp o .png)
 * agrupados por equipo (una plantilla sale de 1-2 descargas) con un índice JSON; la web
 * los desempaqueta al vuelo (src/renderer/src/web/mediaPack.ts).
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const ROOT = path.resolve(import.meta.dirname, '../..')
const OUT = path.join(ROOT, 'dist-artifact')
const DB = path.join(ROOT, 'data', 'd3basket.db')
const PACK_BYTES = 520 * 1024

execSync(`npx vite build --config vite.web.config.ts --outDir ${OUT}`, {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_ARTIFACT: '1' }
})

// ── Orden de las fotos: por el último equipo de cada jugador, para que una plantilla
// quede en uno o dos paquetes.
const playersDir = path.join(OUT, 'media', 'players')
const photos = fs.readdirSync(playersDir).filter((f) => f.endsWith('.webp'))
const clubOf = new Map()
if (fs.existsSync(DB)) {
  const db = new Database(DB, { readonly: true })
  const rows = db
    .prepare(
      `SELECT 'f' || x.external_id AS ref, t.club_id AS club, MAX(s.start_year) AS y
       FROM external_ids x
       JOIN roster_entries r ON r.player_id = x.entity_id
       JOIN teams t ON t.id = r.team_id
       JOIN competition_seasons cs ON cs.id = t.competition_season_id
       JOIN seasons s ON s.id = cs.season_id
       WHERE x.entity_type = 'player' AND x.source = 'feb'
       GROUP BY x.external_id, t.club_id`
    )
    .all()
  const best = new Map()
  for (const r of rows) if (!best.has(r.ref) || best.get(r.ref).y < r.y) best.set(r.ref, r)
  for (const [ref, r] of best) clubOf.set(ref, `${9999 - r.y}-${r.club}`)
  db.close()
}
photos.sort((a, b) => {
  const ka = clubOf.get(a.replace('.webp', '')) ?? 'z'
  const kb = clubOf.get(b.replace('.webp', '')) ?? 'z'
  return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : 1
})

const packsDir = path.join(OUT, 'media', 'packs')
fs.mkdirSync(packsDir, { recursive: true })
const index = {}
const type = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream')

function pack(name, files, dir, prefix) {
  const bufs = []
  let offset = 0
  for (const f of files) {
    const b = fs.readFileSync(path.join(dir, f))
    index[`${prefix}${f}`] = [name, offset, b.length, type(f)]
    bufs.push(b)
    offset += b.length
  }
  fs.writeFileSync(path.join(packsDir, name), Buffer.concat(bufs))
}

let batch = []
let size = 0
let n = 0
for (const f of photos) {
  batch.push(f)
  size += fs.statSync(path.join(playersDir, f)).size
  if (size >= PACK_BYTES) {
    pack(`p${String(n++).padStart(3, '0')}.webp`, batch, playersDir, 'media/players/')
    batch = []
    size = 0
  }
}
if (batch.length) pack(`p${String(n++).padStart(3, '0')}.webp`, batch, playersDir, 'media/players/')

const logosDir = path.join(OUT, 'media', 'logos')
pack('logos.png', fs.readdirSync(logosDir).filter((f) => f.endsWith('.png')), logosDir, 'media/logos/')

fs.rmSync(playersDir, { recursive: true })
fs.rmSync(logosDir, { recursive: true })
fs.writeFileSync(path.join(OUT, 'media', 'pack-index.json'), JSON.stringify(index))

// ── Página: el visor envuelve el contenido en su propio <html><head><body>, así que se
// publica solo el título, las hojas de estilo, el contenedor y el script de arranque.
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')
const tags = [...html.matchAll(/<link rel="stylesheet"[^>]*>|<script type="module"[^>]*><\/script>/g)].map((m) => m[0])
fs.writeFileSync(
  path.join(OUT, 'page.html'),
  `<title>D3 Basket</title>
<meta name="description" content="Scouting y estadísticas de baloncesto español: Liga Endesa, Primera, Segunda y Tercera FEB">
${tags.join('\n')}
<div id="root"><div class="boot">Cargando D3 Basket…</div></div>
`
)
fs.rmSync(path.join(OUT, 'index.html'))
// El visor solo sirve tipos web estándar: la BD comprimida viaja con extensión .wasm y
// cada paquete con la de su primera imagen (WebP o PNG). Fuera lo que no se usa.
fs.renameSync(path.join(OUT, 'data', 'd3basket.db.gz'), path.join(OUT, 'data', 'd3basket-db.wasm'))
for (const f of fs.readdirSync(path.join(OUT, 'assets'))) if (f.startsWith('sql-wasm')) fs.rmSync(path.join(OUT, 'assets', f))

const files = []
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))))
walk(OUT)
const mb = (b) => (b / 1024 / 1024).toFixed(1)
const total = files.reduce((s, f) => s + fs.statSync(f).size, 0)
console.log(`✔ dist-artifact: ${files.length} ficheros, ${mb(total)} MB · ${n} paquetes de fotos + escudos · ${Object.keys(index).length} imágenes`)
