// Medallas de la selección española masculina (Juegos Olímpicos, Mundial y EuroBasket) con sus
// plantillas, desde las cajas de navegación de la Wikipedia inglesa («Spain squad ...»).
// Uso: node tools/site/selecciones.mjs  → escribe tools/site/selecciones.json
import { writeFileSync } from 'node:fs'

const T = [
  ['Spain Men Basketball Squad 1984 Summer Olympics', 'JJOO', 1984],
  ['Spain Men Basketball Squad 2008 Summer Olympics', 'JJOO', 2008],
  ['Spain Men Basketball Squad 2012 Summer Olympics', 'JJOO', 2012],
  ['Spain Men Basketball Squad 2016 Summer Olympics', 'JJOO', 2016],
  ['Spain Squad 2006 FIBA World Championship', 'Mundial', 2006],
  ['Spain Squad 2019 FIBA World Cup', 'Mundial', 2019],
  ...[1935, 1973, 1983, 1999, 2001, 2003, 2007, 2009, 2011, 2013, 2015, 2017, 2022].map((y) => [`Spain squad EuroBasket ${y}`, 'EuroBasket', y])
]
const MEDAL = { gold: 'oro', silver: 'plata', bronze: 'bronce' }
const out = []
for (const [title, kind, year] of T) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent('Template:' + title)}&prop=wikitext&format=json&formatversion=2`
  let j
  // La API limita las peticiones seguidas: se reintenta con esperas crecientes.
  for (let i = 0; i < 8 && !j; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'd3-basket/1.0 (proyecto personal)' } })
    const t = await r.text()
    if (t.startsWith('{')) j = JSON.parse(t)
    else await new Promise((res) => setTimeout(res, 15000 * (i + 1)))
  }
  if (!j) throw new Error(`Sin respuesta para ${title}`)
  const w = j.parse?.wikitext ?? ''
  const medal = MEDAL[/(gold|silver|bronze)/i.exec(/\|\s*comp\s*=([^\n]*)/.exec(w)?.[1] ?? '')?.[1]?.toLowerCase()]
  const players = []
  for (const m of w.matchAll(/\|\s*p(\d+)\s*=\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]([^\n]*)/g)) {
    players.push({ num: m[1], name: m[2].replace(/\s*\([^)]*\)\s*$/, '').trim(), mvp: /MVP/.test(m[3]) })
  }
  const coach = /\|\s*coach\s*=\s*\[\[([^\]|]+)/.exec(w)?.[1]?.replace(/\s*\([^)]*\)\s*$/, '')
  out.push({ kind, year, medal, players, coach })
  console.log(`${kind} ${year}: ${medal ?? '¿?'} · ${players.length} jugadores`)
  await new Promise((r) => setTimeout(r, 4000))
}
writeFileSync(new URL('./selecciones.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
