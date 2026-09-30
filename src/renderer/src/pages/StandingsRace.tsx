import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameRow, StandingRow } from '../../../shared/api'
import { TeamLogo } from '../components'
import { leagueTheme } from '../leagues'

// Evolución de la clasificación jornada a jornada (liga regular). Todas las líneas en gris
// y hasta 4 equipos destacados con color propio; el color sigue al equipo, no a su puesto.

const SLOTS = 4

/** Nombre corto para la etiqueta directa (la FEB no publica abreviaturas). */
const label = (t: StandingRow, max = 14) => {
  const s = t.abbr ?? t.short_name ?? t.name
  return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s
}

interface Point {
  round: number
  position: number
  won: number
  lost: number
}

/** Posición de cada equipo tras cada jornada. La última coincide con la clasificación oficial. */
function race(games: GameRow[], rows: StandingRow[]) {
  const ids = new Set(rows.map((r) => r.team_id))
  const played = games
    .filter((g) => g.phase === 'regular' && g.status === 'finished' && g.home_score != null && g.away_score != null && ids.has(g.home.team_id) && ids.has(g.away.team_id))
    .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))
  const rounds = [...new Set(played.map((g) => g.round_number ?? 0))]
  const acc = new Map(rows.map((r) => [r.team_id, { won: 0, lost: 0, diff: 0, pf: 0 }]))
  const series = new Map<number, Point[]>(rows.map((r) => [r.team_id, []]))
  let i = 0
  for (const [k, round] of rounds.entries()) {
    for (; i < played.length && (played[i].round_number ?? 0) === round; i++) {
      const g = played[i]
      const h = acc.get(g.home.team_id)!
      const a = acc.get(g.away.team_id)!
      const d = g.home_score! - g.away_score!
      if (d > 0) (h.won++, a.lost++)
      else (a.won++, h.lost++)
      h.diff += d
      a.diff -= d
      h.pf += g.home_score!
      a.pf += g.away_score!
    }
    const last = k === rounds.length - 1
    const order = last
      ? [...rows].sort((x, y) => x.position - y.position).map((r) => r.team_id)
      : [...acc.entries()]
          .sort(([, x], [, y]) => y.won - x.won || x.lost - y.lost || y.diff - x.diff || y.pf - x.pf)
          .map(([id]) => id)
    order.forEach((id, pos) => {
      const s = acc.get(id)!
      series.get(id)!.push({ round, position: pos + 1, won: s.won, lost: s.lost })
    })
  }
  return { rounds, series }
}

export function StandingsRace({ games, rows, code }: { games: GameRow[]; rows: StandingRow[]; code?: string }) {
  const { rounds, series } = useMemo(() => race(games, rows), [games, rows])
  const byId = useMemo(() => new Map(rows.map((r) => [r.team_id, r])), [rows])
  // equipo → hueco de color (0-3), estable al quitar otros.
  const [slots, setSlots] = useState<Map<number, number>>(() => {
    const top = [...rows].sort((a, b) => a.position - b.position).slice(0, 2)
    return new Map(top.map((r, i) => [r.team_id, i]))
  })
  const [hover, setHover] = useState<number>()
  const svg = useRef<SVGSVGElement>(null)
  const plot = useRef<HTMLDivElement>(null)
  // Se dibuja al ancho real (sin escalar el viewBox) para que el texto no encoja en el móvil.
  const [W, setW] = useState(900)
  useEffect(() => {
    const el = plot.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const narrow = W < 560
  const PAD = { top: 16, right: narrow ? 92 : 130, bottom: 30, left: 30 }

  if (rounds.length < 2) return null
  const n = rows.length
  const H = Math.max(narrow ? 220 : 260, n * (narrow ? 17 : 20)) + PAD.top + PAD.bottom
  const x = (k: number) => PAD.left + (k / (rounds.length - 1)) * (W - PAD.left - PAD.right)
  const y = (p: number) => PAD.top + ((p - 1) / Math.max(1, n - 1)) * (H - PAD.top - PAD.bottom)
  const path = (pts: Point[]) => pts.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.position).toFixed(1)}`).join('')

  const toggle = (id: number) =>
    setSlots((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else {
        const used = new Set(next.values())
        let free = [...Array(SLOTS).keys()].find((s) => !used.has(s))
        if (free === undefined) {
          const [oldest] = next.keys()
          free = next.get(oldest)!
          next.delete(oldest)
        }
        next.set(id, free)
      }
      return next
    })

  const onMove = (e: React.PointerEvent) => {
    const box = svg.current!.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const k = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (rounds.length - 1))
    setHover(Math.max(0, Math.min(rounds.length - 1, k)))
  }

  const zones = rows.some((r) => r.group) ? [] : (leagueTheme(code)?.zones ?? [])
  const picked = [...slots.entries()].filter(([id]) => series.has(id)).sort((a, b) => a[1] - b[1])
  const tipTeams = (picked.length ? picked.map(([id]) => id) : [...series.keys()])
    .map((id) => ({ id, p: series.get(id)![hover ?? 0] }))
    .sort((a, b) => a.p.position - b.p.position)
    .slice(0, picked.length ? SLOTS : 3)
  const tipLeft = hover != null ? (x(hover) / W) * 100 : 0

  return (
    <div className="race">
      <div className="race-legend" role="group" aria-label="Equipos destacados">
        {[...rows]
          .sort((a, b) => a.position - b.position)
          .map((r) => {
            const s = slots.get(r.team_id)
            return (
              <button key={r.team_id} className={`race-chip${s !== undefined ? ` on race-s${s}` : ''}`} onClick={() => toggle(r.team_id)} aria-pressed={s !== undefined}>
                <span className="race-swatch" />
                <TeamLogo src={r.logo} name={r.name} size={16} />
                {r.short_name ?? r.name}
              </button>
            )
          })}
      </div>
      <div className="race-plot" ref={plot}>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="race-svg" onPointerMove={onMove} onPointerLeave={() => setHover(undefined)} role="img" aria-label="Evolución de la clasificación por jornada">
          {zones.map((z) => {
            const from = z.from < 0 ? n + 1 + z.from : z.from
            const to = z.to < 0 ? n + 1 + z.to : z.to
            return <rect key={z.label} className={`race-zone zone-${z.kind}`} x={PAD.left} width={W - PAD.left - PAD.right} y={y(from) - 7} height={y(to) - y(from) + 14} />
          })}
          {[...Array(n).keys()].map((i) =>
            i === 0 || (i + 1) % 5 === 0 || i === n - 1 ? (
              <text key={i} className="race-axis" x={PAD.left - 10} y={y(i + 1) + 4} textAnchor="end">
                {i + 1}
              </text>
            ) : null
          )}
          {rounds.map((r, k) =>
            k === 0 || k === rounds.length - 1 || (k + 1) % (narrow ? 10 : 5) === 0 ? (
              <text key={r} className="race-axis" x={x(k)} y={H - 8} textAnchor="middle">
                J{k + 1}
              </text>
            ) : null
          )}
          {[...series.entries()]
            .filter(([id]) => !slots.has(id))
            .map(([id, pts]) => (
              <path key={id} className="race-line muted" d={path(pts)} />
            ))}
          {hover != null && <line className="race-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top - 8} y2={H - PAD.bottom + 6} />}
          {picked.map(([id, s]) => {
            const pts = series.get(id)!
            const end = pts[pts.length - 1]
            const t = byId.get(id)!
            return (
              <g key={id} className={`race-s${s}`}>
                <path className="race-line on" d={path(pts)} />
                <circle className="race-dot" cx={x(pts.length - 1)} cy={y(end.position)} r={4.5} />
                {hover != null && <circle className="race-dot" cx={x(hover)} cy={y(pts[hover].position)} r={5} />}
                <text className="race-label" x={x(pts.length - 1) + 10} y={y(end.position) + 4}>
                  {end.position}º {label(t, narrow ? 9 : 14)}
                </text>
              </g>
            )
          })}
        </svg>
        {hover != null && (
          <div className="race-tip" style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 60 ? '-105%' : '12px'})` }}>
            <b>Jornada {hover + 1}</b>
            {tipTeams.map(({ id, p }) => {
              const s = slots.get(id)
              const t = byId.get(id)!
              return (
                <div key={id} className={`race-tip-row${s !== undefined ? ` race-s${s}` : ''}`}>
                  <span className="race-swatch" />
                  <span className="pos">{p.position}º</span>
                  <span className="name">{t.short_name ?? t.name}</span>
                  <span className="muted">
                    {p.won}-{p.lost}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <p className="race-note muted">
        Pulsa en un equipo para destacarlo (hasta {SLOTS}). Puesto tras cada jornada por victorias y diferencia de puntos; la última
        jornada usa la clasificación oficial con sus desempates.
        {zones.length > 0 && ` Franjas: ${zones.map((z) => z.label.toLowerCase()).join(', ')}.`}
      </p>
    </div>
  )
}
