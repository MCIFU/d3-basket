// Prueba de humo de la web construida (dist-site): abre las páginas principales en Chromium y falla si
// alguna da un error de JavaScript, se queda cargando o no muestra su título.
// Uso: node tools/site/smoke.mjs   (antes: npm run site:data && npm run site:build)
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { createRequire } from 'node:module'
// require() también encuentra un Playwright instalado globalmente (NODE_PATH), no solo en node_modules.
const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = new URL('../../dist-site/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let f = join(ROOT, p)
  try {
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
    res.end(await readFile(f))
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(0)
const base = `http://localhost:${server.address().port}/`

// Rutas a comprobar: fijas y sacadas de los propios datos (un jugador, un club y un partido reales).
const meta = JSON.parse(await readFile(join(ROOT, 'd/meta.json'), 'utf8'))
const days = JSON.parse(await readFile(join(ROOT, 'd/days.json'), 'utf8'))
const search = JSON.parse(await readFile(join(ROOT, 'd/search.json'), 'utf8'))
const acb = meta.comps.find((c) => c.code === 'ACB') ?? meta.comps[0]
const player = search.p.find((r) => r[3] === acb.code) ?? search.p[0]
const club = search.c.find((r) => r[3] === acb.code) ?? search.c[0]
const game = days.games.find((g) => g.st === 'f' && g.box) ?? days.games[0]
const routes = [
  '#/',
  '#/ligas',
  `#/liga/${acb.code}`,
  `#/liga/${acb.code}?v=estadisticas`,
  `#/club/${club[0]}`,
  `#/jugador/${player[0]}`,
  `#/jugador/${player[0]}?v=trayectoria`,
  game && `#/partido/${game.id}`,
  '#/jugadores',
  '#/espanoles',
  `#/comparar/${player[0]}/${search.p.find((r) => r[3] === acb.code && r[0] !== player[0])?.[0] ?? player[0]}`
].filter(Boolean)

const browser = await chromium.launch()
let failed = 0
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  for (const r of routes) {
    const errors = []
    page.removeAllListeners('pageerror')
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(base + r, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const ok = await page.evaluate(() => !!document.querySelector('.hero h1, .vs-name, .hg .big') && !document.querySelector('[aria-busy="true"]') && document.documentElement.scrollWidth <= innerWidth + 1)
    const status = errors.length ? `error: ${errors[0]}` : ok ? 'ok' : 'sin contenido o desborda el ancho'
    if (status !== 'ok') failed++
    console.log(`${status === 'ok' ? '✓' : '✗'} ${width}px ${r}${status === 'ok' ? '' : ' — ' + status}`)
  }
  await page.close()
}
await browser.close()
server.close()
if (failed) {
  console.error(`\n${failed} comprobaciones fallidas`)
  process.exit(1)
}
console.log('\nTodas las páginas cargan bien')
