import { useEffect, useMemo, useState } from 'react'
import { Court, Crest, Foot, Loading, Sec, src, Flag } from '../components/ui'
import { palette } from '../lib/color'
import { S, compOf, loadEd, loadPlayer, loadSearch, useLoad, type EdFile, type Meta, type PlayerRec, type SearchIdx } from '../lib/data'
import { age, height, n1, per, POS, seasonLabel, ts, val } from '../lib/fmt'
import { href } from '../lib/router'
import { percentiles } from '../lib/stats'

const go = (a?: string, b?: string) => (location.hash = `/comparar${a ? '/' + encodeURIComponent(a) : ''}${b ? '/' + encodeURIComponent(b) : ''}`)

export default function Compare({ meta, a, b }: { meta: Meta; a?: string; b?: string }) {
  useEffect(() => {
    document.title = 'Comparar jugadores · d3 basket'
  }, [])
  const pa = useLoad(() => (a ? loadPlayer(a) : Promise.resolve(undefined)), [a])
  const pb = useLoad(() => (b ? loadPlayer(b) : Promise.resolve(undefined)), [b])
  if ((a && pa === undefined) || (b && pb === undefined)) return <Loading />
  const A = pa && !(pa instanceof Error) ? pa : undefined
  const B = pb && !(pb instanceof Error) ? pb : undefined
  return <Page meta={meta} A={A} B={B} />
}

/** Temporada principal del jugador (la de su equipo actual o la más reciente con partidos). */
function mainSeason(p: PlayerRec) {
  const ed = p.cur?.ed ?? p.seasons.find((s) => s.ed != null)?.ed ?? null
  const lines = p.seasons.filter((s) => s.ed === ed)
  if (!lines.length) return undefined
  return lines.reduce((x, s) => ({ ...x, gp: x.gp + s.gp, w: x.w + s.w, s: x.s.map((v, i) => (v ?? 0) + (s.s[i] ?? 0)) }), { ...lines[0], gp: 0, w: 0, s: new Array(19).fill(0) as (number | null)[] })
}

function Page({ meta, A, B }: { meta: Meta; A?: PlayerRec; B?: PlayerRec }) {
  const sa = A && mainSeason(A)
  const sb = B && mainSeason(B)
  const ea = useLoad(() => (sa?.ed ? loadEd(sa.ed) : Promise.resolve(undefined)), [sa?.ed])
  const eb = useLoad(() => (sb?.ed ? loadEd(sb.ed) : Promise.resolve(undefined)), [sb?.ed])
  const ta = A?.cur ? A.tm[A.cur.t] : undefined
  const tb = B?.cur ? B.tm[B.cur.t] : undefined
  const pa = palette(ta?.c1, ta?.c2, '#0a2a5c')
  let pb = palette(tb?.c1, tb?.c2, '#7a0f1c')
  if (pa.dk === pb.dk) pb = { dk: '#7a0f1c', lt: '#e8b100' }
  const pcA = useMemo(() => (A && ea && !(ea instanceof Error) ? percentiles(ea as EdFile, A.ref) : null), [A, ea])
  const pcB = useMemo(() => (B && eb && !(eb instanceof Error) ? percentiles(eb as EdFile, B.ref) : null), [B, eb])
  const both = A && B
  return (
    <div style={{ ['--c-dk' as string]: pa.dk, ['--c-lt' as string]: pa.lt, ['--cb' as string]: pb.dk }}>
      <section className="hero" style={{ background: `linear-gradient(100deg, ${pa.dk} 0%, ${pa.dk} 38%, ${pb.dk} 62%, ${pb.dk} 100%)` }}>
        <Court />
        <Court className="court left" />
        <div className="wrap">
          <div className="vs">
            <Side p={A} other={B?.ref} side="a" />
            <div className="vs-mid">
              <span>VS</span>
            </div>
            <Side p={B} other={A?.ref} side="b" />
          </div>
        </div>
      </section>
      <main className="wrap page">
        {!both && <Picker A={A} B={B} />}
        {both && sa && sb && (
          <>
            <section className="card" style={{ marginTop: -50, position: 'relative', zIndex: 2 }}>
              <Sec aside={`${compOf(meta, sa.code)?.name} ${seasonLabel(sa.y)} · ${compOf(meta, sb.code)?.name} ${seasonLabel(sb.y)}`}>Esta temporada</Sec>
              <Duel A={sa} B={sb} ca={pa.dk} cb={pb.dk} />
            </section>
            <div className="grid g-2">
              <section className="card">
                <Sec aside="percentil en su liga">Perfil</Sec>
                {pcA && pcB ? <RadarDuo a={pcA.items} b={pcB.items} ca={pa.dk} cb={pb.dk} na={A.name} nb={B.name} /> : <div className="empty">Sin datos suficientes</div>}
              </section>
              <section className="card">
                <Sec>Carrera</Sec>
                <Career A={A} B={B} ca={pa.dk} cb={pb.dk} />
              </section>
            </div>
          </>
        )}
      </main>
      <Foot updated={meta.updated} />
    </div>
  )
}

function Side({ p, other, side }: { p?: PlayerRec; other?: string; side: 'a' | 'b' }) {
  const [bad, setBad] = useState(false)
  if (!p)
    return (
      <div className={`vs-side ${side} empty-side`}>
        <div className="silhouette sm">?</div>
        <div className="vs-name">Elige un jugador</div>
      </div>
    )
  const t = p.cur ? p.tm[p.cur.t] : undefined
  const img = !bad ? (p.cut ?? p.photo) : null
  return (
    <div className={`vs-side ${side}`}>
      <div className="vs-pic">{img ? <img src={src(img)} alt="" onError={() => setBad(true)} className={p.cut ? 'cut' : 'framed'} /> : <div className="silhouette sm">{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>}</div>
      <a className="vs-name" href={href.player(p.ref)}>
        {p.name}
      </a>
      <div className="vs-sub">
        {t && <Crest url={t.l} name={t.n} c1={t.c1} size={22} />}
        {t?.n}
      </div>
      <div className="vs-sub muted2">
        {[p.posc ? POS[p.posc] : p.pos, age(p.birth) ? `${age(p.birth)} años` : null, height(p.h)].filter(Boolean).join(' · ')}
        {p.nat && (
          <>
            {' · '}
            <Flag nat={p.nat} /> {p.nat}
          </>
        )}
      </div>
      <button className="fav" style={{ marginTop: 12 }} onClick={() => (side === 'a' ? go(undefined, other) : go(other))}>
        Cambiar
      </button>
    </div>
  )
}

function Picker({ A, B }: { A?: PlayerRec; B?: PlayerRec }) {
  const [idx, setIdx] = useState<SearchIdx>()
  const [q, setQ] = useState('')
  useEffect(() => {
    loadSearch().then(setIdx)
  }, [])
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  const res = useMemo(() => {
    if (!idx || q.trim().length < 2) return []
    const w = norm(q).split(/\s+/)
    return idx.p
      .filter((r) => w.every((x) => norm(r[1]).includes(x)))
      .sort((x, y) => (y[4] ?? 0) - (x[4] ?? 0))
      .slice(0, 12)
  }, [idx, q])
  const pick = (ref: string) => (A ? go(A.ref, ref) : B ? go(ref, B.ref) : go(ref))
  return (
    <section className="card" style={{ marginTop: -50, position: 'relative', zIndex: 2, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
      <Sec>{A || B ? 'Elige el segundo jugador' : 'Elige el primer jugador'}</Sec>
      <div className="search-in">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3.5 3.5" />
        </svg>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe un nombre: Llull, Maledon, Aldama…" aria-label="Buscar jugador" />
      </div>
      <div className="pick">
        {res.map((r) => (
          <button key={r[0]} onClick={() => pick(r[0])}>
            <Crest url={r[5]} name={r[2] ?? r[1]} size={26} />
            <span>
              <b>{r[1]}</b>
              <small>{[r[2], r[4] ? seasonLabel(r[4]) : null].filter(Boolean).join(' · ')}</small>
            </span>
          </button>
        ))}
        {q.trim().length >= 2 && idx && !res.length && <div className="empty">Sin resultados</div>}
      </div>
    </section>
  )
}

type SeasonAgg = NonNullable<ReturnType<typeof mainSeason>>
function Duel({ A, B, ca, cb }: { A: SeasonAgg; B: SeasonAgg; ca: string; cb: string }) {
  const a = per(A.s, A.gp)
  const b = per(B.s, B.gp)
  const p3 = (s: (number | null)[]) => ((s[S.f3a] ?? 0) ? (100 * (s[S.f3m] ?? 0)) / (s[S.f3a] ?? 1) : 0)
  const rows: [string, number, number, boolean?, string?][] = [
    ['Partidos', A.gp, B.gp],
    ['Minutos', a.min, b.min],
    ['Puntos', a.pts, b.pts],
    ['Rebotes', a.reb, b.reb],
    ['Asistencias', a.ast, b.ast],
    ['Robos', a.stl, b.stl],
    ['Tapones', a.blk, b.blk],
    ['Pérdidas', a.tov, b.tov, true],
    ['% tiro verdadero', (ts(A.s) ?? 0) * 100, (ts(B.s) ?? 0) * 100, false, '%'],
    ['% triples', p3(A.s), p3(B.s), false, '%'],
    ['Valoración', a.val, b.val]
  ]
  return (
    <div className="duel">
      {rows.map(([k, x, y, lower, unit]) => {
        const max = Math.max(Math.abs(x), Math.abs(y), 0.0001)
        const wa = lower ? x < y : x > y
        const wb = lower ? y < x : y > x
        const f = (v: number) => (k === 'Partidos' ? String(v) : n1(v)) + (unit ? ' %' : '')
        return (
          <div className="dr" key={k}>
            <b className={wa ? 'win' : ''} style={wa ? { color: ca } : undefined}>
              {f(x)}
            </b>
            <div className="dbar l">
              <i style={{ width: `${(100 * Math.max(0, x)) / max}%`, background: ca, opacity: wa ? 1 : 0.45 }} />
            </div>
            <span className="dk">{k}</span>
            <div className="dbar">
              <i style={{ width: `${(100 * Math.max(0, y)) / max}%`, background: cb, opacity: wb ? 1 : 0.45 }} />
            </div>
            <b className={wb ? 'win' : ''} style={wb ? { color: cb } : undefined}>
              {f(y)}
            </b>
          </div>
        )
      })}
    </div>
  )
}

type Items = NonNullable<ReturnType<typeof percentiles>>['items']
function RadarDuo({ a, b, ca, cb, na, nb }: { a: Items; b: Items; ca: string; cb: string; na: string; nb: string }) {
  const keys = a.filter((x) => x.k !== 'tov' && b.some((y) => y.k === x.k)).slice(0, 8)
  const size = 340
  const c = size / 2
  const R = c - 50
  const n = keys.length
  const pt = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [c + r * Math.cos(ang), c + r * Math.sin(ang)]
  }
  const poly = (items: Items) => keys.map((k, i) => pt(i, (R * Math.max(4, items.find((x) => x.k === k.k)!.pct)) / 100).join(',')).join(' ')
  return (
    <>
      <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="Perfil comparado por percentiles">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={keys.map((_, i) => pt(i, R * f).join(',')).join(' ')} className="ring" />
        ))}
        {keys.map((_, i) => (
          <line key={i} x1={c} y1={c} x2={pt(i, R)[0]} y2={pt(i, R)[1]} className="spoke" />
        ))}
        <g className="shape">
          <polygon points={poly(a)} fill={ca} fillOpacity={0.22} stroke={ca} strokeWidth={2.5} strokeLinejoin="round" />
          <polygon points={poly(b)} fill={cb} fillOpacity={0.22} stroke={cb} strokeWidth={2.5} strokeLinejoin="round" />
        </g>
        {keys.map((k, i) => {
          const [lx, ly] = pt(i, R + 28)
          return (
            <text key={k.k} x={lx} y={ly + 4} textAnchor="middle" className="rl">
              {k.short}
            </text>
          )
        })}
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: ca }} />
          {na}
        </span>
        <span>
          <i style={{ background: cb }} />
          {nb}
        </span>
      </div>
    </>
  )
}

function Career({ A, B, ca, cb }: { A: PlayerRec; B: PlayerRec; ca: string; cb: string }) {
  const tot = (p: PlayerRec) => {
    const s = new Array(19).fill(0)
    let gp = 0
    for (const x of p.seasons) {
      gp += x.gp
      x.s.forEach((v, i) => (s[i] += v ?? 0))
    }
    return { gp, s, seasons: new Set(p.seasons.map((x) => x.y)).size }
  }
  const x = tot(A)
  const y = tot(B)
  const rows: [string, string, string, number, number][] = [
    ['Temporadas', String(x.seasons), String(y.seasons), x.seasons, y.seasons],
    ['Partidos', String(x.gp), String(y.gp), x.gp, y.gp],
    ['Puntos por partido', n1(x.s[S.pts] / (x.gp || 1)), n1(y.s[S.pts] / (y.gp || 1)), x.s[S.pts] / (x.gp || 1), y.s[S.pts] / (y.gp || 1)],
    ['Valoración por partido', n1(val(x.s) / (x.gp || 1)), n1(val(y.s) / (y.gp || 1)), val(x.s) / (x.gp || 1), val(y.s) / (y.gp || 1)],
    ['Títulos con su club', String(A.titles?.filter((t) => t.won).length ?? 0), String(B.titles?.filter((t) => t.won).length ?? 0), A.titles?.filter((t) => t.won).length ?? 0, B.titles?.filter((t) => t.won).length ?? 0],
    ['Medallas con España', String(A.medals?.length ?? 0), String(B.medals?.length ?? 0), A.medals?.length ?? 0, B.medals?.length ?? 0]
  ]
  return (
    <div className="ctab">
      {rows.map(([k, va, vb, na, nb]) => (
        <div key={k} className="cr">
          <b style={na > nb ? { color: ca } : { color: 'var(--tx2)', fontWeight: 600 }}>{va}</b>
          <span>{k}</span>
          <b style={nb > na ? { color: cb } : { color: 'var(--tx2)', fontWeight: 600 }}>{vb}</b>
        </div>
      ))}
    </div>
  )
}
