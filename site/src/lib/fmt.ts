/** Formato en español de España: números, fechas, edades y estadísticas. */
import { S, type Line } from './data'

export const n1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '–' : v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
export const n0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('es-ES'))
export const pct = (m: number, a: number) => (a ? Math.round((100 * m) / a) : null)
export const pctTxt = (m: number, a: number) => (a ? `${n1((100 * m) / a)} %` : '–')

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const TZ = 'Europe/Madrid'

/** Fecha en hora de España: partes numéricas. */
export function madrid(iso: string) {
  const d = new Date(iso)
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour, mm: p.minute, wd: new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay() }
}
/** Clave de día (AAAA-MM-DD) en hora de España. */
export const dayKey = (iso: string) => {
  const m = madrid(iso)
  return `${m.y}-${String(m.m).padStart(2, '0')}-${String(m.d).padStart(2, '0')}`
}
export const dateShort = (iso: string | null) => {
  if (!iso) return 'Sin fecha'
  const m = madrid(iso)
  return `${m.d} ${MES[m.m - 1]}`
}
export const dateYear = (iso: string | null) => {
  if (!iso) return 'Sin fecha'
  const m = madrid(iso)
  return `${m.d} ${MES[m.m - 1]} ${m.y}`
}
export const dateLong = (iso: string) => {
  const m = madrid(iso)
  return `${DIAL[m.wd]} ${m.d} de ${MESL[m.m - 1]} de ${m.y}`
}
export const weekday = (iso: string) => DIA[madrid(iso).wd]
/** Hora en España; las 00:00 suelen ser partidos sin hora confirmada. */
export const time = (iso: string | null) => {
  if (!iso) return ''
  const m = madrid(iso)
  return m.hh === '00' && m.mm === '00' ? '' : `${m.hh}:${m.mm}`
}
const utc = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
/** Etiqueta de un día respecto a hoy: «Hoy», «Ayer», «Mañana» o el día de la semana. */
export const dayLabel = (key: string, today: string) => {
  const diff = Math.round((utc(key) - utc(today)) / 86400_000)
  const d = new Date(utc(key))
  return { top: diff === 0 ? 'Hoy' : diff === -1 ? 'Ayer' : diff === 1 ? 'Mañana' : DIA[d.getUTCDay()], sub: `${d.getUTCDate()} ${MES[d.getUTCMonth()]}` }
}
export const dob = (iso: string | null) => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}
export function age(iso: string | null, at = new Date()) {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  let a = at.getFullYear() - y
  if (at.getMonth() + 1 < m || (at.getMonth() + 1 === m && at.getDate() < d)) a--
  return a
}
export const height = (cm: number | null) => (cm ? `${Math.floor(cm / 100)},${String(cm % 100).padStart(2, '0')} m` : null)
export const feet = (cm: number | null) => {
  if (!cm) return null
  const inch = Math.round(cm / 2.54)
  return `${Math.floor(inch / 12)}' ${inch % 12}"`
}
export const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
export const seasonLabel = (y: number) => `${y}-${String(y + 1).slice(2)}`

export const POS: Record<string, string> = { PG: 'Base', SG: 'Escolta', SF: 'Alero', PF: 'Ala-pívot', C: 'Pívot', G: 'Base', F: 'Alero' }
export const POS_SHORT: Record<string, string> = { PG: 'B', SG: 'E', SF: 'A', PF: 'AP', C: 'P', G: 'B', F: 'A' }

/** Bandera a partir del nombre del país (los más habituales). */
const FLAGS: Record<string, string> = {
  España: 'ES', 'EE.UU.': 'US', 'Estados Unidos': 'US', USA: 'US', Francia: 'FR', Italia: 'IT', Alemania: 'DE', Grecia: 'GR', Turquía: 'TR', Serbia: 'RS', Croacia: 'HR', Eslovenia: 'SI', Lituania: 'LT', Letonia: 'LV',
  Montenegro: 'ME', 'Bosnia y Herzegovina': 'BA', 'Macedonia del Norte': 'MK', Argentina: 'AR', Brasil: 'BR', Uruguay: 'UY', Canadá: 'CA', Australia: 'AU', 'Reino Unido': 'GB', Bélgica: 'BE', 'Países Bajos': 'NL', Portugal: 'PT',
  Polonia: 'PL', 'República Checa': 'CZ', Chequia: 'CZ', Finlandia: 'FI', Suecia: 'SE', Dinamarca: 'DK', Noruega: 'NO', Islandia: 'IS', Georgia: 'GE', Ucrania: 'UA', Rusia: 'RU', Israel: 'IL', Nigeria: 'NG', Senegal: 'SN',
  Camerún: 'CM', Mali: 'ML', Angola: 'AO', 'Costa de Marfil': 'CI', 'República Dominicana': 'DO', 'Puerto Rico': 'PR', Venezuela: 'VE', México: 'MX', Cuba: 'CU', Japón: 'JP', China: 'CN', Austria: 'AT', Suiza: 'CH', Hungría: 'HU',
  Rumanía: 'RO', Bulgaria: 'BG', Eslovaquia: 'SK', Estonia: 'EE', Irlanda: 'IE', Guinea: 'GN', 'Guinea Ecuatorial': 'GQ', 'Cabo Verde': 'CV', Chile: 'CL', Colombia: 'CO', Panamá: 'PA', Bahamas: 'BS', Jamaica: 'JM', Haití: 'HT',
  France: 'FR', Italy: 'IT', Germany: 'DE', Greece: 'GR', Turkey: 'TR', Türkiye: 'TR', Spain: 'ES', 'United States': 'US', Lithuania: 'LT', Latvia: 'LV', Croatia: 'HR', Slovenia: 'SI', Belgium: 'BE', Netherlands: 'NL', Canada: 'CA'
}
export const flag = (nat: string | null) => {
  const cc = nat ? FLAGS[nat] ?? (nat.length === 2 ? nat.toUpperCase() : null) : null
  return cc ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : ''
}

// ───────────────────────── Estadística ─────────────────────────
/** Valoración: la oficial si existe; si no, la fórmula europea con lo disponible. */
export const val = (s: Line) => s[S.pir] ?? (s[S.pts] ?? 0) + (s[S.reb] ?? 0) + (s[S.ast] ?? 0) + (s[S.stl] ?? 0) + (s[S.blk] ?? 0) - ((s[S.f2a] ?? 0) - (s[S.f2m] ?? 0)) - ((s[S.f3a] ?? 0) - (s[S.f3m] ?? 0)) - ((s[S.fta] ?? 0) - (s[S.ftm] ?? 0)) - (s[S.tov] ?? 0) - (s[S.pf] ?? 0) + (s[S.fd] ?? 0)
export const fga = (s: Line) => (s[S.f2a] ?? 0) + (s[S.f3a] ?? 0)
export const fgm = (s: Line) => (s[S.f2m] ?? 0) + (s[S.f3m] ?? 0)
export const ts = (s: Line) => {
  const d = 2 * (fga(s) + 0.44 * (s[S.fta] ?? 0))
  return d ? (s[S.pts] ?? 0) / d : null
}
/** Medias por partido de una línea acumulada. */
export function per(s: Line, gp: number) {
  const g = gp || 1
  const v = (i: number) => (s[i] ?? 0) / g
  return { min: v(S.sec) / 60, pts: v(S.pts), reb: v(S.reb), oreb: v(S.oreb), dreb: v(S.dreb), ast: v(S.ast), stl: v(S.stl), blk: v(S.blk), tov: v(S.tov), pf: v(S.pf), val: val(s) / g, pm: v(S.pm) }
}
