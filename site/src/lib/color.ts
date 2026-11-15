import type { CSSProperties } from 'react'
/** Colores de club y liga para portadas y acentos. */
const hex = (h: string) => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6)
  const n = parseInt(f, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** Luminancia relativa (0 negro, 1 blanco). */
export const lum = (h: string) => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const mix = (a: string, b: string, t: number) => {
  const x = hex(a)
  const y = hex(b)
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t)
}
const valid = (c: string | null | undefined): c is string => !!c && /^#?[0-9a-f]{3,8}$/i.test(c.trim())
/** Saturación aproximada: los grises y blancos no sirven de color de fondo. */
const sat = (h: string) => {
  const [r, g, b] = hex(h)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx ? (mx - mn) / mx : 0
}

/**
 * Pareja de colores para una portada: `dk` (fondo, siempre oscuro para texto blanco) y `lt` (brillo).
 * Elige el color más oscuro del club; si los dos son claros (blanco, amarillo) lo oscurece.
 */
export function palette(c1?: string | null, c2?: string | null, fallback = '#0b4ea2') {
  const cs = [c1, c2].filter(valid).map((c) => (c.startsWith('#') ? c : '#' + c).toLowerCase())
  if (!cs.length) cs.push(fallback)
  // Un color casi blanco o gris no sirve de base si el otro tiene color.
  const usable = cs.filter((c) => !(lum(c) > 0.8 || (sat(c) < 0.12 && lum(c) > 0.25)))
  const base = (usable.length ? usable : cs).sort((a, b) => lum(a) - lum(b))
  let dk = base[0]
  if (lum(dk) > 0.2) dk = mix(dk, '#000000', Math.min(0.75, (lum(dk) - 0.12) * 1.3))
  const other = cs.find((c) => c !== base[0])
  const lt = other && lum(other) > lum(dk) + 0.05 && sat(other) > 0.15 ? other : mix(base[0], '#ffffff', lum(base[0]) > 0.4 ? 0.15 : 0.45)
  return { dk, lt }
}
export const cssVars = (p: { dk: string; lt: string }) => ({ '--h1': p.lt, '--h2': p.dk, '--c-dk': p.dk, '--c-lt': p.lt }) as CSSProperties

/** Color de una valoración de partido (escala tipo Sofascore). */
export const valColor = (v: number) => (v >= 25 ? 'var(--r-top)' : v >= 15 ? 'var(--r-good)' : v >= 8 ? 'var(--r-ok)' : v >= 0 ? 'var(--r-low)' : 'var(--r-bad)')
/** Color de un percentil. */
export const pctColor = (p: number) => (p >= 80 ? 'var(--r-good)' : p >= 60 ? 'var(--r-ok)' : p >= 40 ? 'var(--r-mid)' : p >= 20 ? 'var(--r-low)' : 'var(--r-bad)')
