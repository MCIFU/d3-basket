/** Piezas visuales compartidas por todas las páginas. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { palette } from '../lib/color'
import { dateShort, n1, time } from '../lib/fmt'
import { href } from '../lib/router'

/** Ruta de imagen: las locales (media/...) son relativas a la web. */
export const src = (u: string | null | undefined) => (!u ? undefined : /^(https?:|data:)/.test(u) ? u : `./${u.replace(/^\.?\//, '')}`)

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** Escudo con sustituto (siglas sobre el color del club) si no hay imagen o falla. */
export function Crest({ url, name, c1, size = 24, className = 'cr' }: { url?: string | null; name: string; c1?: string | null; size?: number; className?: string }) {
  const [bad, setBad] = useState(false)
  if (url && !bad) return <img className={className} src={src(url)} alt="" width={size} height={size} loading="lazy" onError={() => setBad(true)} style={{ width: size, height: size }} />
  return (
    <span className={`crest-ph ${className}`} style={{ width: size, height: size, background: palette(c1).dk, fontSize: Math.max(9, size * 0.36) }} aria-hidden>
      {initials(name).slice(0, 3)}
    </span>
  )
}

/** Foto redonda de jugador o sus iniciales. */
export function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const [bad, setBad] = useState(false)
  return (
    <span className="av" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url && !bad ? <img src={src(url)} alt="" loading="lazy" onError={() => setBad(true)} /> : initials(name)}
    </span>
  )
}

export function Sec({ children, aside, more }: { children: ReactNode; aside?: ReactNode; more?: { to: string; label: string } }) {
  return (
    <h2 className="sec">
      <span>{children}</span>
      {aside != null && <small>{aside}</small>}
      {more && (
        <a className="more" href={more.to}>
          {more.label} →
        </a>
      )}
    </h2>
  )
}

export const Loading = ({ label = 'Cargando' }: { label?: string }) => <div className="loading">{label}</div>

export function NotFound({ what }: { what: string }) {
  return (
    <div className="loading" style={{ animation: 'none' }}>
      <div>
        {what} no encontrado
        <div style={{ marginTop: 14 }}>
          <a className="chip" href={href.home()}>
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  )
}

/** Pestañas que cambian un parámetro de la URL. */
export function Tabs<T extends string>({ value, set, items }: { value: T; set: (v: T) => void; items: [T, string][] }) {
  return (
    <nav className="tabs" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </nav>
  )
}

/** Franja de cifras grandes que se superpone a la portada. */
export function Strip({ items, note }: { items: { k: string; v: string; bar?: number; rank?: string }[]; note: ReactNode }) {
  return (
    <section className={`strip n${items.length}`} style={{ '--n': items.length } as CSSProperties}>
      {items.map((it) => (
        <div key={it.k}>
          <div className="v">{it.v}</div>
          <div className="k">{it.k}</div>
          {it.bar != null && (
            <div className="bar">
              <i style={{ width: `${Math.max(2, it.bar)}%` }} />
            </div>
          )}
          {it.rank && <div className="rk">{it.rank}</div>}
        </div>
      ))}
      <div className="note">{note}</div>
    </section>
  )
}

/** Barras de un valor por partido con su media. */
export function BarChart({ data, color, avgLabel = 'Media', h = 250 }: { data: { v: number; lab: string; sub: string; title: string; color?: string; href?: string }[]; color: string; avgLabel?: string; h?: number; w?: number }) {
  // El dibujo usa el ancho real en píxeles: el texto mantiene su tamaño en cualquier pantalla.
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(760)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (!data.length) return <div className="empty">Sin partidos</div>
  return <div ref={box}>{chartSvg(data, color, avgLabel, h, w)}</div>
}

function chartSvg(data: { v: number; lab: string; sub: string; title: string; color?: string; href?: string }[], color: string, avgLabel: string, h: number, w: number) {
  const padL = 26
  const padB = 36
  const padT = 22
  const max = Math.max(10, ...data.map((d) => d.v)) * 1.12
  const min = Math.min(0, ...data.map((d) => d.v))
  const step = (w - padL) / data.length
  const bw = Math.min(46, step * 0.62)
  const y = (v: number) => padT + (h - padT - padB) * (1 - (v - min) / (max - min))
  const avg = data.reduce((s, d) => s + d.v, 0) / data.length
  const ticks = [0, 10, 20, 30, 40, 50, 60].filter((t) => t <= max && t >= min)
  const showLab = step > 26
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Gráfico por partido">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={w} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 8} y={y(t) + 4} className="tick" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + step * i + (step - bw) / 2
        const top = Math.min(y(d.v), y(0))
        const bar = (
          <g key={i}>
            <rect className="bar" x={x} y={top} width={bw} height={Math.max(1, Math.abs(y(0) - y(d.v)))} rx={Math.min(5, bw / 4)} fill={d.color ?? color}>
              <title>{d.title}</title>
            </rect>
            {showLab && (
              <>
                <text x={x + bw / 2} y={top - 6} className="val" textAnchor="middle">
                  {d.v}
                </text>
                <text x={x + bw / 2} y={h - 18} className="lab" textAnchor="middle">
                  {d.lab}
                </text>
                <text x={x + bw / 2} y={h - 5} className="sub" textAnchor="middle">
                  {d.sub}
                </text>
              </>
            )}
          </g>
        )
        return d.href ? (
          <a key={i} href={d.href}>
            {bar}
          </a>
        ) : (
          bar
        )
      })}
      <line x1={padL} x2={w} y1={y(avg)} y2={y(avg)} className="avg" stroke="var(--tx)" />
      <text x={w - 2} y={y(avg) - 7} className="avgt" textAnchor="end">
        {avgLabel} {n1(avg)}
      </text>
    </svg>
  )
}

/** Radar de percentiles. */
export function Radar({ items, color, size = 320 }: { items: { short: string; pct: number }[]; color: string; size?: number }) {
  const c = size / 2
  const R = size / 2 - 48
  const n = items.length
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [c + r * Math.cos(a), c + r * Math.sin(a)]
  }
  const poly = items.map((it, i) => pt(i, (R * Math.max(it.pct, 4)) / 100).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="Perfil por percentiles">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={items.map((_, i) => pt(i, R * f).join(',')).join(' ')} className="ring" />
      ))}
      {items.map((_, i) => (
        <line key={i} x1={c} y1={c} x2={pt(i, R)[0]} y2={pt(i, R)[1]} className="spoke" />
      ))}
      <polygon points={poly} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {items.map((it, i) => {
        const [x, yy] = pt(i, (R * Math.max(it.pct, 4)) / 100)
        const [lx, ly] = pt(i, R + 26)
        return (
          <g key={i}>
            <circle cx={x} cy={yy} r={3.5} fill={color} />
            <text x={lx} y={ly} textAnchor="middle" className="rl">
              {it.short}
            </text>
            <text x={lx} y={ly + 14} textAnchor="middle" className="rv">
              {it.pct}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Marcador de un partido (jornada, día). */
export function Score({ id, d, st, h, a, hs, as, hn, an, hl, al, hc1, ac1, extra }: { id: string; d: string | null; st: string; h: unknown; a: unknown; hs: number | null; as: number | null; hn: string; an: string; hl: string | null; al: string | null; hc1?: string | null; ac1?: string | null; extra?: ReactNode }) {
  void h
  void a
  const fin = st === 'f' && hs != null && as != null
  const hw = fin && hs! > as!
  const aw = fin && as! > hs!
  return (
    <a className="score" href={href.game(id)}>
      <div className={`tm ${fin && !hw ? 'lose' : ''}`}>
        <Crest url={hl} name={hn} c1={hc1} />
        <span>{hn}</span>
      </div>
      {fin ? <div className={`pts ${!hw ? 'lose' : ''}`}>{hs}</div> : <div className="time">{st === 'p' ? 'APLAZ.' : time(d) || '—'}</div>}
      <div className={`tm ${fin && !aw ? 'lose' : ''}`}>
        <Crest url={al} name={an} c1={ac1} />
        <span>{an}</span>
      </div>
      {fin && <div className={`pts ${!aw ? 'lose' : ''}`}>{as}</div>}
      <div className="when">
        <span>{extra ?? dateShort(d)}</span>
        {fin ? <span className="fin">Final</span> : st === 'p' ? <span className="fin">Aplazado</span> : null}
      </div>
    </a>
  )
}

/** Tabla ordenable por columnas. */
export interface Col<T> {
  k: string
  label: string
  get: (r: T) => number | string | null
  fmt?: (r: T) => ReactNode
  l?: boolean
  b?: boolean
  hideM?: boolean
  asc?: boolean
}
export function SortTable<T>({ rows, cols, initial, onRow, rowClass, limit }: { rows: T[]; cols: Col<T>[]; initial: string; onRow?: (r: T) => string | undefined; rowClass?: (r: T) => string; limit?: number }) {
  const [key, setKey] = useState(initial)
  const [all, setAll] = useState(false)
  const col = cols.find((c) => c.k === key) ?? cols[0]
  const sorted = useMemo(() => {
    const r = [...rows]
    r.sort((x, y) => {
      const a = col.get(x)
      const b = col.get(y)
      if (a == null) return 1
      if (b == null) return -1
      const d = typeof a === 'string' ? a.localeCompare(b as string, 'es') : (b as number) - a
      return col.asc ? -d : d
    })
    return r
  }, [rows, col])
  const shown = limit && !all ? sorted.slice(0, limit) : sorted
  return (
    <>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.k} className={`${c.l ? 'l' : ''} ${c.hideM ? 'hide-m' : ''} sort ${c.k === key ? 'on' : ''}`} onClick={() => setKey(c.k)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const to = onRow?.(r)
              return (
                <tr key={i} className={`${to ? 'link' : ''} ${rowClass?.(r) ?? ''}`} onClick={to ? () => (location.hash = to.replace(/^#/, '')) : undefined}>
                  {cols.map((c) => (
                    <td key={c.k} className={`${c.l ? 'l' : ''} ${c.b ? 'b' : ''} ${c.k === key && !c.l ? 'hi' : ''} ${c.hideM ? 'hide-m' : ''}`}>
                      {c.fmt ? c.fmt(r) : (c.get(r) ?? '–')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="chip" onClick={() => setAll(!all)}>
            {all ? 'Ver menos' : `Ver los ${rows.length}`}
          </button>
        </div>
      )}
    </>
  )
}

/** Pie de página. */
export function Foot({ updated }: { updated?: string | null }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>d3 basket · datos de acb.com, FEB, EuroLeague, FIBA y ligas nacionales</span>
        {updated && <span>Actualizado el {new Date(updated).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </footer>
  )
}
