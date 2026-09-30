import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerData, SearchResult, TrajectoryRow } from '../../../shared/api'
import { CompetitionBadge, Empty, Loading, PlayerPhoto, Section, Segmented, TeamLogo } from '../components'
import { age, num } from '../format'
import { leagueTheme } from '../leagues'
import { href, navigate } from '../router'

// Comparador de dos jugadores: barras emparejadas por estadística (azul = A, naranja = B).
// Cada jugador elige su temporada, así se puede comparar a alguien consigo mismo.

type Mode = 'pg' | 'p40'
type Side = 'a' | 'b'

interface Metric {
  label: string
  unit: string
  /** Valor por partido / por 40 minutos; null si no hay datos. */
  value: (r: TrajectoryRow, mode: Mode) => number | null
  /** Porcentajes: escala fija 0-100. */
  pct?: boolean
  /** Pérdidas y faltas: gana el valor más bajo. */
  lower?: boolean
  /** Detalle para la ficha emergente. */
  detail?: (r: TrajectoryRow) => string
}

const per = (total: keyof TrajectoryRow, avg: keyof TrajectoryRow) => (r: TrajectoryRow, mode: Mode) =>
  mode === 'pg' ? (r[avg] as number) : r.seconds > 0 ? ((r[total] as number) / r.seconds) * 2400 : null

const GROUPS: { title: string; metrics: Metric[] }[] = [
  {
    title: 'Producción',
    metrics: [
      { label: 'Minutos', unit: 'min', value: (r) => r.mpg, detail: (r) => `${r.games} partidos` },
      { label: 'Puntos', unit: 'pts', value: per('pts', 'ppg'), detail: (r) => `${r.pts} en total` },
      { label: 'Rebotes', unit: 'reb', value: per('reb', 'rpg'), detail: (r) => `${r.oreb} ofensivos · ${r.dreb} defensivos` },
      { label: 'Asistencias', unit: 'ast', value: per('ast', 'apg'), detail: (r) => `${r.ast} en total` },
      { label: 'Robos', unit: 'rob', value: per('stl', 'spg'), detail: (r) => `${r.stl} en total` },
      { label: 'Tapones', unit: 'tap', value: per('blk', 'bpg'), detail: (r) => `${r.blk} en total` },
      { label: 'Valoración', unit: 'val', value: per('pir', 'pirpg'), detail: (r) => `${r.pir} en total` },
      { label: 'Pérdidas', unit: 'pér', value: per('tov', 'tpg'), lower: true, detail: (r) => `${r.tov} en total` },
      { label: 'Faltas', unit: 'fal', value: per('pf', 'pfpg'), lower: true, detail: (r) => `${r.pf} cometidas · ${r.fd} recibidas` }
    ]
  },
  {
    title: 'Tiro',
    metrics: [
      { label: 'True shooting', unit: '%', pct: true, value: (r) => r.ts_pct, detail: (r) => `${r.pts} pts en ${r.fg2a + r.fg3a} tiros y ${r.fta} TL` },
      { label: 'eFG%', unit: '%', pct: true, value: (r) => r.efg_pct, detail: (r) => `${r.fg2m + r.fg3m}/${r.fg2a + r.fg3a} de campo` },
      { label: 'Tiros de 2', unit: '%', pct: true, value: (r) => r.fg2_pct, detail: (r) => `${r.fg2m}/${r.fg2a}` },
      { label: 'Triples', unit: '%', pct: true, value: (r) => r.fg3_pct, detail: (r) => `${r.fg3m}/${r.fg3a}` },
      { label: 'Tiros libres', unit: '%', pct: true, value: (r) => r.ft_pct, detail: (r) => `${r.ftm}/${r.fta}` }
    ]
  }
]

const SAMPLE = 5

const seasonKey = (r: TrajectoryRow) => `${r.start_year}|${r.competition_code}|${r.team_name}`
const compName = (code: string) => leagueTheme(code)?.name ?? code.replace('_', ' ')

/** Temporadas con minutos, de la más reciente a la más antigua. */
function seasons(data: PlayerData) {
  return data.trajectory.filter((r) => r.games > 0 && r.seconds > 0).sort((x, y) => y.start_year - x.start_year || y.games - x.games)
}

export function ComparePage({ a, b }: { a?: string; b?: string }) {
  const [mode, setMode] = useState<Mode>('pg')
  const [pick, setPick] = useState<Record<Side, string | undefined>>({ a: undefined, b: undefined })
  const [data, setData] = useState<Record<Side, PlayerData | null | undefined>>({ a: undefined, b: undefined })
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    const load = (side: Side, ref?: string) => {
      if (!ref) return setData((d) => ({ ...d, [side]: undefined }))
      window.d3
        .player(ref)
        .then((p) => live && setData((d) => ({ ...d, [side]: p })))
        .catch((e: unknown) => live && setError(String(e)))
    }
    load('a', a)
    load('b', b)
    setPick({ a: undefined, b: undefined })
    return () => {
      live = false
    }
  }, [a, b])

  const rows = useMemo(() => {
    const out: Record<Side, TrajectoryRow | undefined> = { a: undefined, b: undefined }
    for (const side of ['a', 'b'] as Side[]) {
      const list = data[side] ? seasons(data[side]!) : []
      out[side] = list.find((r) => seasonKey(r) === pick[side]) ?? list.find((r) => r.games >= SAMPLE) ?? list[0]
    }
    return out
  }, [data, pick])

  if (error) return <Loading error={error} />
  const setRef = (side: Side, ref: string | undefined) => {
    const refs = { a, b, [side]: ref }
    navigate(href.compare(refs.a, refs.b))
  }
  const ready = rows.a && rows.b

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Jugadores</div>
        <h1>Comparador</h1>
        <p>Dos jugadores, cualquier temporada de la Liga Endesa o la FEB. Pasa el ratón por las barras para ver el detalle.</p>
      </div>

      <div className="cmp-players">
        {(['a', 'b'] as Side[]).map((side) => (
          <PlayerSlot
            key={side}
            side={side}
            refId={side === 'a' ? a : b}
            data={data[side]}
            row={rows[side]}
            onSeason={(k) => setPick((p) => ({ ...p, [side]: k }))}
            onPlayer={(ref) => setRef(side, ref)}
          />
        ))}
      </div>

      {ready ? (
        <Section
          title="Cara a cara"
          eyebrow={mode === 'pg' ? 'Por partido' : 'Por 40 minutos'}
          actions={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { id: 'pg', label: 'Por partido' },
                { id: 'p40', label: 'Por 40 min' }
              ]}
            />
          }
        >
          <Legend a={data.a!} b={data.b!} ra={rows.a!} rb={rows.b!} />
          <Verdict ra={rows.a!} rb={rows.b!} mode={mode} a={data.a!} b={data.b!} />
          <div className="cmp-groups">
            {GROUPS.map((g) => (
              <div key={g.title} className="cmp-group">
                <h3>{g.title}</h3>
                {g.metrics.map((m) => (
                  <MetricRow key={m.label} m={m} mode={mode} ra={rows.a!} rb={rows.b!} na={data.a!.player.display_name} nb={data.b!.player.display_name} />
                ))}
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <Empty>
          {data.a === null || data.b === null
            ? 'No se ha encontrado uno de los jugadores.'
            : (data.a && !rows.a) || (data.b && !rows.b)
              ? 'Uno de los jugadores no tiene minutos registrados en ninguna temporada.'
              : 'Elige dos jugadores para compararlos.'}
        </Empty>
      )}
    </>
  )
}

function PlayerSlot({
  side,
  refId,
  data,
  row,
  onSeason,
  onPlayer
}: {
  side: Side
  refId?: string
  data: PlayerData | null | undefined
  row: TrajectoryRow | undefined
  onSeason: (key: string) => void
  onPlayer: (ref: string | undefined) => void
}) {
  if (!refId || data === null) return <div className={`card cmp-slot cmp-${side}`}><PlayerPicker side={side} onPick={onPlayer} /></div>
  if (data === undefined) return <div className={`card cmp-slot cmp-${side}`}><Loading /></div>
  const p = data.player
  const list = seasons(data)
  return (
    <div className={`card cmp-slot cmp-${side}`}>
      <div className="cmp-slot-head">
        <PlayerPhoto nobg={p.photo_nobg} photo={p.photo} name={p.display_name} color={data.current?.color} size={72} />
        <div style={{ minWidth: 0 }}>
          <div className="cmp-tag">
            <span className="cmp-swatch" /> Jugador {side.toUpperCase()}
          </div>
          <a className="cmp-name" href={href.player(p.ref, p.display_name)}>
            {p.display_name}
          </a>
          <div className="muted" style={{ fontSize: 13 }}>
            {[p.position, p.height_cm ? `${(p.height_cm / 100).toFixed(2).replace('.', ',')} m` : null, p.birth_date ? `${age(p.birth_date)} años` : null, p.nationality]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <button className="btn btn-ghost cmp-change" onClick={() => onPlayer(undefined)} title="Cambiar jugador">
          Cambiar
        </button>
      </div>
      {row && (
        <div className="cmp-season">
          <TeamLogo src={row.logo} name={row.team_name} size={26} />
          <select className="select" value={seasonKey(row)} onChange={(e) => onSeason(e.target.value)} aria-label="Temporada">
            {list.map((r) => (
              <option key={seasonKey(r)} value={seasonKey(r)}>
                {r.label} · {compName(r.competition_code)} · {r.team_name} ({r.games} PJ)
              </option>
            ))}
          </select>
          <CompetitionBadge name={row.competition_code} />
        </div>
      )}
    </div>
  )
}

function PlayerPicker({ side, onPick }: { side: Side; onPick: (ref: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) setResults([])
      else void window.d3.search(q).then((r) => setResults(r.filter((x) => x.kind === 'player').slice(0, 8)))
    }, 150)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    if (side === 'b') input.current?.focus()
  }, [side])
  return (
    <div className="cmp-picker">
      <div className="cmp-tag">
        <span className="cmp-swatch" /> Jugador {side.toUpperCase()}
      </div>
      <input
        ref={input}
        className="input"
        placeholder="Buscar jugador…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && results[0] && onPick(results[0].ref)}
      />
      {results.length > 0 && (
        <div className="cmp-results">
          {results.map((r) => (
            <button key={r.ref} onClick={() => onPick(r.ref)}>
              <PlayerPhoto nobg={r.image} name={r.name} size={32} />
              <span>
                <div className="sr-name">{r.name}</div>
                {r.detail && <div className="sr-detail">{r.detail}</div>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Legend({ a, b, ra, rb }: { a: PlayerData; b: PlayerData; ra: TrajectoryRow; rb: TrajectoryRow }) {
  return (
    <div className="cmp-legend">
      {[
        [a, ra, 'a'],
        [b, rb, 'b']
      ].map(([p, r, s]) => (
        <span key={s as string} className={`cmp-${s as string}`}>
          <span className="cmp-swatch" />
          <b>{(p as PlayerData).player.display_name}</b>
          <span className="muted">
            {(r as TrajectoryRow).label} · {(r as TrajectoryRow).team_name}
          </span>
          {(r as TrajectoryRow).games < SAMPLE && <span className="chip">Muestra pequeña: {(r as TrajectoryRow).games} PJ</span>}
        </span>
      ))}
    </div>
  )
}

/** Resumen: en cuántas estadísticas sale mejor cada uno. */
function Verdict({ ra, rb, mode, a, b }: { ra: TrajectoryRow; rb: TrajectoryRow; mode: Mode; a: PlayerData; b: PlayerData }) {
  let wa = 0
  let wb = 0
  const metrics = GROUPS.flatMap((g) => g.metrics).filter((m) => m.unit !== 'min')
  for (const m of metrics) {
    const va = m.value(ra, mode)
    const vb = m.value(rb, mode)
    if (va == null || vb == null || Math.abs(va - vb) < 0.05) continue
    if (va > vb !== !!m.lower) wa++
    else wb++
  }
  return (
    <p className="cmp-verdict">
      <span className="cmp-a">
        <b>{a.player.display_name}</b> mejor en {wa}
      </span>
      <span className="muted"> · </span>
      <span className="cmp-b">
        <b>{b.player.display_name}</b> mejor en {wb}
      </span>
      <span className="muted"> de {metrics.length} estadísticas</span>
    </p>
  )
}

function MetricRow({ m, mode, ra, rb, na, nb }: { m: Metric; mode: Mode; ra: TrajectoryRow; rb: TrajectoryRow; na: string; nb: string }) {
  const va = m.value(ra, mode)
  const vb = m.value(rb, mode)
  const max = m.pct ? 100 : Math.max(va ?? 0, vb ?? 0, 0.1) * 1.08
  const better = va == null || vb == null || Math.abs(va - vb) < 0.05 ? null : va > vb !== !!m.lower ? 'a' : 'b'
  const suffix = m.pct ? '%' : ''
  const bar = (side: Side, v: number | null, r: TrajectoryRow, name: string) => (
    <div className={`cmp-bar cmp-${side}${better === side ? ' best' : ''}`} tabIndex={0}>
      <span className="track">
        <span className="fill" style={{ width: v == null ? 0 : `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} />
      </span>
      <span className="val">{v == null ? '—' : `${num(v)}${suffix}`}</span>
      <span className="cmp-tip" role="tooltip">
        <b>{name}</b>
        <span>
          {r.label} · {r.team_name}
        </span>
        <span>
          {m.label}: <b>{v == null ? '—' : `${num(v)}${suffix}`}</b>
          {!m.pct && m.unit !== 'min' ? (mode === 'pg' ? ' por partido' : ' por 40 min') : ''}
        </span>
        {m.detail && <span className="muted">{m.detail(r)}</span>}
      </span>
    </div>
  )
  return (
    <div className="cmp-row">
      <div className="cmp-label">
        {m.label}
        {m.lower && <span className="muted"> · menos es mejor</span>}
      </div>
      {bar('a', va, ra, na)}
      {bar('b', vb, rb, nb)}
    </div>
  )
}
