// Utilidades compartidas por las tres maquetas.
const Q = new URLSearchParams(location.search)
const P = window.PLAYERS[Q.get('p') || 'alonso']
if (Q.get('theme')) document.documentElement.dataset.theme = Q.get('theme')

const n1 = (v) => (v == null ? '–' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const n0 = (v) => (v == null ? '–' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fecha = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MES[m - 1]}`
}
const pctShot = (m, a) => (a ? Math.round((100 * m) / a) : 0)
const valLabel = () => (P.valCalc ? 'VAL*' : 'VAL')

/** Color de la valoración de un partido, escala tipo Sofascore. */
const valColor = (v) => (v >= 25 ? 'var(--r-top)' : v >= 15 ? 'var(--r-good)' : v >= 8 ? 'var(--r-ok)' : v >= 0 ? 'var(--r-low)' : 'var(--r-bad)')
/** Color de un percentil. */
const pctColor = (p) => (p >= 80 ? 'var(--r-good)' : p >= 60 ? 'var(--r-ok)' : p >= 40 ? 'var(--r-mid)' : p >= 20 ? 'var(--r-low)' : 'var(--r-bad)')

/**
 * Barras de puntos por partido (de más antiguo a más reciente) con la media como línea.
 * opts: { h, bar: color o fn(g), avgColor, label: fn(g) texto bajo cada barra }
 */
function gameChart(games, opts = {}) {
  const gs = games.slice().reverse()
  const W = opts.w || 640, H = opts.h || 200, padL = 28, padB = 34, padT = 18
  const max = Math.max(10, ...gs.map((g) => g.pts)) * 1.15
  const bw = Math.min(46, ((W - padL) / gs.length) * 0.58)
  const step = (W - padL) / gs.length
  const y = (v) => padT + (H - padT - padB) * (1 - v / max)
  const avg = gs.reduce((s, g) => s + g.pts, 0) / gs.length
  const ticks = [0, 10, 20, 30, 40].filter((t) => t <= max)
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Puntos por partido">`
  for (const t of ticks) s += `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`
  gs.forEach((g, i) => {
    const x = padL + step * i + (step - bw) / 2
    const col = typeof opts.bar === 'function' ? opts.bar(g) : opts.bar || 'currentColor'
    s += `<rect x="${x}" y="${y(g.pts)}" width="${bw}" height="${y(0) - y(g.pts)}" rx="${opts.rx ?? 3}" fill="${col}"><title>${g.opp}: ${g.pts} pts</title></rect>`
    s += `<text x="${x + bw / 2}" y="${y(g.pts) - 6}" class="val" text-anchor="middle">${g.pts}</text>`
    s += `<text x="${x + bw / 2}" y="${H - 18}" class="lab" text-anchor="middle">${g.oppAbbr}</text>`
    s += `<text x="${x + bw / 2}" y="${H - 5}" class="sub" text-anchor="middle">${g.win ? 'V' : 'D'}</text>`
  })
  s += `<line x1="${padL}" x2="${W}" y1="${y(avg)}" y2="${y(avg)}" class="avg" stroke="${opts.avgColor || 'currentColor'}"/>`
  s += `<text x="${W - 2}" y="${y(avg) - 6}" class="avgt" text-anchor="end">Media ${n1(avg)}</text></svg>`
  return s
}

/** Radar de percentiles. */
function radar(items, color, size = 300) {
  const c = size / 2, R = size / 2 - 46, n = items.length
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [c + r * Math.cos(a), c + r * Math.sin(a)]
  }
  let s = `<svg viewBox="0 0 ${size} ${size}" class="radar">`
  for (const f of [0.25, 0.5, 0.75, 1]) s += `<polygon points="${items.map((_, i) => pt(i, R * f).join(',')).join(' ')}" class="ring"/>`
  items.forEach((_, i) => (s += `<line x1="${c}" y1="${c}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" class="spoke"/>`))
  s += `<polygon points="${items.map((it, i) => pt(i, (R * Math.max(it.pct, 4)) / 100).join(',')).join(' ')}" fill="${color}" fill-opacity=".28" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`
  items.forEach((it, i) => {
    const [x, y] = pt(i, (R * Math.max(it.pct, 4)) / 100)
    s += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
    const [lx, ly] = pt(i, R + 24)
    s += `<text x="${lx}" y="${ly}" text-anchor="middle" class="rl">${it.short}</text><text x="${lx}" y="${ly + 13}" text-anchor="middle" class="rv">${it.pct}</text>`
  })
  return s + '</svg>'
}
const SHORT = { pts: 'Puntos', pir: 'Valor.', ts: 'TS%', p3: 'Triples', ast: 'Asist.', stl: 'Robos', reb: 'Rebotes', tov: 'Pérdidas', blk: 'Tapones' }
const fmtPct = (it) => (it.k === 'ts' || it.k === 'p3' ? `${n1(it.value)} %` : n1(it.value))

function toggleTheme() {
  const r = document.documentElement
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  r.dataset.theme = dark ? 'light' : 'dark'
}

/** Colores del club ordenados: [oscuro, claro]. El oscuro sirve de fondo; el claro, de acento. */
function clubColors(t) {
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) }
  return lum(t.c1) <= lum(t.c2) ? [t.c1, t.c2] : [t.c2, t.c1]
}
