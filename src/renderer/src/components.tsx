import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GameRow, HonourRow, TeamLite } from '../../shared/api'
import { clock, fmtDay, fmtTime, initials, teamColor } from './format'
import { href } from './router'
import copaImg from './assets/trophies/copa.png'
import ligaImg from './assets/trophies/liga.png'
import supercopaImg from './assets/trophies/supercopa.png'

// ───────────────────────── Datos ─────────────────────────

/** Carga asíncrona dependiente de `deps`: [datos, error, recargar]. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [T | undefined, string | undefined, () => void] {
  const [state, setState] = useState<{ data?: T; error?: string; key: string }>({ key: '' })
  const [tick, setTick] = useState(0)
  const key = JSON.stringify(deps)
  useEffect(() => {
    let alive = true
    fn()
      .then((data) => alive && setState({ data, key }))
      .catch((e) => alive && setState({ error: String(e?.message ?? e), key }))
    return () => {
      alive = false
    }
  }, [key, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  // Mientras llega la nueva carga no se muestran datos de otra página.
  return state.key === key ? [state.data, state.error, reload] : [undefined, undefined, reload]
}

export function Loading({ error }: { error?: string }) {
  if (error) return <div className="state state-error">No se han podido cargar los datos: {error}</div>
  return (
    <div className="state">
      <span className="spinner" /> Cargando…
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>
}

// ───────────────────────── Identidad visual ─────────────────────────

export function TeamLogo({ src, name, size = 28 }: { src?: string | null; name?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="logo-fallback" style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {initials(name ?? '?')}
      </span>
    )
  }
  return (
    <img className="logo" src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
  )
}

export function TeamLink({ team, year, logo = true, short, size = 24 }: { team: TeamLite; year?: number; logo?: boolean; short?: boolean; size?: number }) {
  return (
    <a className="team-link" href={href.club(team.club_ref, team.name, undefined, year)}>
      {logo && <TeamLogo src={team.logo} name={team.name} size={size} />}
      <span>{short ? (team.short_name ?? team.name) : team.name}</span>
    </a>
  )
}

/** Fotos originales de la FEB (de medio cuerpo) aún sin procesar en public/media: en avatares se amplía la cara. */
export const isHalfBody = (src?: string | null) => !!src && src.includes('imagenes.feb.es')

// ───────────────────────── Competiciones ─────────────────────────

const COMPETITION_STYLE: { match: RegExp; label?: string; bg: string; fg: string }[] = [
  // Colores oficiales de cada liga (ver leagues.ts).
  { match: /^(ACB|LIGA ENDESA)/i, label: 'Liga Endesa', bg: '#da3b00', fg: '#fff' },
  { match: /^(LEB_ORO|PRIMERA FEB|LEB ORO)/i, label: 'Primera FEB', bg: '#fe6b00', fg: '#fff' },
  { match: /^(LEB_PLATA|SEGUNDA FEB|LEB PLATA)/i, label: 'Segunda FEB', bg: '#f03039', fg: '#fff' },
  { match: /^(TERCERA_FEB|TERCERA FEB)/i, label: 'Tercera FEB', bg: '#ff9f00', fg: '#241600' },
  { match: /^LEB BRONCE/i, label: 'LEB Bronce', bg: '#9a6b3f', fg: '#fff' },
  { match: /^(LIGA )?EBA$/i, label: 'Tercera FEB', bg: '#ff9f00', fg: '#241600' },
  { match: /^(EUROLEAGUE|EUROLIGA)/i, label: 'EuroLeague', bg: '#f05a22', fg: '#fff' },
  { match: /^EUROCUP/i, label: 'EuroCup', bg: '#1a6fd1', fg: '#fff' },
  { match: /^COPA_ESPANA|COPA ESPA/i, label: 'Copa España', bg: '#c53740', fg: '#fff' },
  { match: /^LIGA U/i, label: 'Liga U', bg: '#7c3aed', fg: '#fff' }
]

export function competitionStyle(name: string) {
  const s = COMPETITION_STYLE.find((c) => c.match.test(name))
  const label = s?.label ?? name.charAt(0) + name.slice(1).toLowerCase()
  return { label, bg: s?.bg ?? '#e2e8f0', fg: s?.fg ?? '#334155' }
}

export function CompetitionBadge({ name }: { name: string }) {
  const s = competitionStyle(name)
  return (
    <span className="comp-badge" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

/** Foto del jugador: cara con fondo transparente sobre el color de su equipo. */
export function PlayerPhoto({
  nobg,
  photo,
  name,
  color,
  size = 56
}: {
  nobg?: string | null
  photo?: string | null
  name: string
  color?: string | null
  size?: number
}) {
  const [src, setSrc] = useState(nobg ?? photo ?? null)
  useEffect(() => setSrc(nobg ?? photo ?? null), [nobg, photo])
  const bg = teamColor(color, '#1f2a44')
  return (
    <span
      className="player-photo"
      style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, ${bg}55, ${bg}22 70%)` }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className={isHalfBody(src) ? 'crop-face' : undefined}
          onError={() => setSrc(src === nobg && photo ? photo : null)}
        />
      ) : (
        <span className="player-initials" style={{ fontSize: size * 0.34 }}>
          {initials(name)}
        </span>
      )}
    </span>
  )
}

/** Foto recortada de ficha (plantillas, índice, líderes): si no carga, iniciales. */
export function CardPhoto({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <span className="rc-initials">{initials(name)}</span>
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

export interface RankRow {
  label: string
  value: string
  sub?: string
  rank?: { rank: number; of: number }
}

/**
 * Hoja de estadística: grupos de filas con la cifra, su detalle y el puesto en la liga
 * con una barra de percentil (el top 10 % en el color de marca). Jugador y club.
 */
export function RankSheet({ groups, scope }: { groups: { title: string; rows: RankRow[] }[]; scope?: string }) {
  return (
    <div className="stat-sheet">
      {groups.map((g) => (
        <div key={g.title} className="sheet-group">
          <h3>{g.title}</h3>
          {g.rows.map((r) => {
            const rk = r.rank
            const share = rk ? (rk.of > 1 ? 1 - (rk.rank - 1) / (rk.of - 1) : 1) : 0
            return (
              <div key={r.label} className="sheet-row">
                <span className="sr-label">
                  {r.label}
                  {r.sub && <small>{r.sub}</small>}
                </span>
                <span className="sr-val">{r.value}</span>
                <span
                  className={`sr-rank${rk && rk.rank <= Math.max(1, Math.round(rk.of * 0.1)) ? ' top' : ''}`}
                  title={rk ? `${rk.rank}º de ${rk.of}${scope ? ` en ${scope}` : ''}` : undefined}
                >
                  {rk ? (
                    <>
                      <span className="sr-bar" aria-hidden="true">
                        <i style={{ width: `${Math.max(4, share * 100)}%` }} />
                      </span>
                      <b>{rk.rank}º</b>
                      <span className="sr-of">/{rk.of}</span>
                    </>
                  ) : (
                    <span className="sr-of">—</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function PlayerLink({ refId, name, children }: { refId: string; name: string; children?: ReactNode }) {
  return (
    <a className="player-link" href={href.player(refId, name)}>
      {children ?? name}
    </a>
  )
}

export const TROPHIES: Record<HonourRow['competition'], { img: string; name: string }> = {
  liga: { img: ligaImg, name: 'Liga' },
  copa: { img: copaImg, name: 'Copa del Rey' },
  supercopa: { img: supercopaImg, name: 'Supercopa' }
}

export function Trophy({ competition, size = 64 }: { competition: HonourRow['competition']; size?: number }) {
  return <img className="trophy" src={TROPHIES[competition].img} alt={`Trofeo ${TROPHIES[competition].name}`} style={{ height: size }} />
}

// ───────────────────────── Estructura ─────────────────────────

export function Section({
  title,
  eyebrow,
  actions,
  children,
  className = ''
}: {
  title?: ReactNode
  eyebrow?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Tabs({ items, active }: { items: { id: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="tabs" aria-label="Secciones">
      {items.map((t) => (
        <a key={t.id} href={t.href} className={t.id === active ? 'active' : ''} aria-current={t.id === active ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Form({ results }: { results: ('W' | 'L')[] }) {
  return (
    <span className="form">
      {results.map((r, i) => (
        <span key={i} className={r === 'W' ? 'dot win' : 'dot loss'} title={r === 'W' ? 'Victoria' : 'Derrota'}>
          {r === 'W' ? 'V' : 'D'}
        </span>
      ))}
    </span>
  )
}

// ───────────────────────── Tabla ordenable ─────────────────────────

export interface Column<T> {
  key: string
  label: string
  title?: string
  num?: boolean
  value?: (row: T) => number | string | null | undefined
  render?: (row: T) => ReactNode
  className?: string
}

export function DataTable<T>({
  rows,
  columns,
  initialSort,
  rowKey,
  limit,
  compact,
  footer
}: {
  rows: T[]
  columns: Column<T>[]
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  rowKey: (row: T, i: number) => string | number
  limit?: number
  compact?: boolean
  footer?: ReactNode
}) {
  const [sort, setSort] = useState(initialSort)
  const [expanded, setExpanded] = useState(false)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const val = col.value ?? ((r: T) => (r as Record<string, unknown>)[col.key] as number)
    return [...rows].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])
  const visible = limit && !expanded ? sorted.slice(0, limit) : sorted

  const toggle = (key: string, isNum?: boolean) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: isNum ? 'desc' : 'asc' }))

  return (
    <div className="table-wrap">
      <table className={`table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? 'num' : ''} ${sort?.key === c.key ? 'sorted' : ''} ${c.className ?? ''}`}
                title={c.title}
                onClick={() => toggle(c.key, c.num)}
              >
                {c.label}
                {sort?.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.num ? 'num' : ''} ${sort?.key === c.key ? 'sorted' : ''} ${c.className ?? ''}`}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
      {limit && sorted.length > limit && (
        <button className="btn btn-ghost btn-block" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Ver menos' : `Ver los ${sorted.length}`}
        </button>
      )}
    </div>
  )
}

// ───────────────────────── Partidos ─────────────────────────

export function GameCard({ g, compact }: { g: GameRow; compact?: boolean }) {
  const played = g.home_score != null && g.away_score != null
  const homeWon = played && g.home_score! > g.away_score!
  const body = (
    <>
      <div className="gc-meta">
        <span>{g.round_name}</span>
        <span>{played ? 'Final' : g.status === 'unscheduled' ? 'Sin fecha' : `${fmtDay(g.scheduled_at)} · ${fmtTime(g.scheduled_at)}`}</span>
      </div>
      {[
        { t: g.home, s: g.home_score, won: homeWon },
        { t: g.away, s: g.away_score, won: played && !homeWon }
      ].map(({ t, s, won }) => (
        <div key={t.team_id} className={`gc-row ${played && !won ? 'lost' : ''}`}>
          <TeamLogo src={t.logo} name={t.name} size={compact ? 22 : 26} />
          <span className="gc-name">{compact ? (t.short_name ?? t.name) : t.name}</span>
          <span className="gc-score">{played ? s : ''}</span>
        </div>
      ))}
    </>
  )
  return g.has_boxscore ? (
    <a className="game-card clickable" href={href.game(g.ref)} title="Ver estadísticas del partido">
      {body}
    </a>
  ) : (
    <div className="game-card">{body}</div>
  )
}

export function Minutes({ seconds }: { seconds: number }) {
  return <>{seconds ? clock(seconds) : 'DNP'}</>
}

export function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => {
        if (window.d3.platform === 'desktop') {
          e.preventDefault()
          void window.d3.openExternal(url)
        }
      }}
    >
      {children}
    </a>
  )
}

/**
 * Medio campo FIBA a escala (decímetros: 150 × 140). Aro a 1,575 m de la línea de fondo,
 * zona de 4,90 × 5,80 m y línea de triple a 6,75 m (0,90 m en las esquinas).
 * `zones` tiñe las zonas de tiro (dentro del triple / fuera) con una intensidad de 0 a 1.
 */
export function HalfCourt({ zones, children, label, note }: { zones?: { two: number; three: number }; children?: ReactNode; label?: string; note?: ReactNode }) {
  return (
    <div className="court">
      {label && <div className="court-label">{label}</div>}
      <svg className="court-lines" viewBox="0 0 150 140" aria-hidden="true">
        {zones && (
          <>
            <path className="z-three" style={{ opacity: 0.05 + 0.2 * zones.three }} d="M1 1 H9 V29.9 A67.5 67.5 0 0 0 141 29.9 V1 H149 V139 H1 Z" />
            <path className="z-two" style={{ opacity: 0.05 + 0.2 * zones.two }} d="M9 1 V29.9 A67.5 67.5 0 0 0 141 29.9 V1 Z" />
          </>
        )}
        <rect x="1" y="1" width="148" height="138" rx="1" />
        <path className="paint" d="M50.5 1 V59 H99.5 V1" />
        <circle cx="75" cy="59" r="18" />
        <path d="M9 1 V29.9 A67.5 67.5 0 0 0 141 29.9 V1" />
        <path d="M57 139 A18 18 0 0 1 93 139" />
        <path d="M66 13 H84" />
        <circle className="rim" cx="75" cy="15.75" r="2.25" />
        <path d="M62.5 15.75 A12.5 12.5 0 0 0 87.5 15.75" />
      </svg>
      {children}
      {note && <span className="court-note">{note}</span>}
    </div>
  )
}

/** Posiciones de un quinteto sobre el medio campo, en % del ancho y del alto. */
export const COURT_SPOTS = { PG: [50, 78], SG: [84, 54], SF: [16, 54], PF: [70, 25], C: [31, 25] } as const

/** Jugador colocado sobre la pista: foto en círculo con el color de su equipo, apellido y dato. */
export function CourtPlayer({ spot, to, photo, name, tag, color }: { spot: keyof typeof COURT_SPOTS; to: string; photo?: string | null; name: string; tag: string; color?: string | null }) {
  const [x, y] = COURT_SPOTS[spot]
  const [failed, setFailed] = useState(false)
  return (
    <a className="court-player" href={to} style={{ left: `${x}%`, top: `${y}%`, ['--c' as string]: teamColor(color, '#15181d') }}>
      <span className="cp-photo">{photo && !failed ? <img src={photo} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{initials(name)}</span>}</span>
      <b>{name}</b>
      <span className="cp-tag">{tag}</span>
    </a>
  )
}
