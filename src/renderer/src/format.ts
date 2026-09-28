const TZ = 'Europe/Madrid'

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }) : 'Sin fecha'

export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : ''

export const fmtDateTime = (iso?: string | null) => (iso ? `${fmtDay(iso)} · ${fmtTime(iso)}` : 'Fecha por confirmar')

export const fmtBirth = (iso?: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export const num = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const int = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('es-ES'))

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${num(v)}%`)

export const signed = (v: number | null | undefined) => (v == null ? '—' : v > 0 ? `+${v}` : String(v))

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

export const shot = (m: number, a: number) => `${m}/${a}`

export function age(birth?: string | null): number | undefined {
  if (!birth) return undefined
  const b = new Date(birth)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

/** Color de equipo seguro para fondos (evita grises/blancos poco legibles). */
export function teamColor(color?: string | null, fallback = '#ff6b00'): string {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return fallback
  const n = parseInt(color.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const sat = Math.max(r, g, b) - Math.min(r, g, b)
  return lum > 0.8 || (sat < 20 && lum > 0.45) ? '#1f2a44' : color
}

export const POSITION_LABEL: Record<string, string> = { PG: 'Base', SG: 'Escolta', SF: 'Alero', PF: 'Ala-pívot', C: 'Pívot' }

export const LICENSE_LABEL: Record<string, string> = {
  JFL: 'Jugador de formación local',
  EUR: 'Comunitario',
  EXT: 'Extracomunitario',
  COT: 'Cotonú'
}
