import { useEffect, useMemo } from 'react'
import { Avatar, Crest, Foot, Loading, NotFound, Sec, SortTable, src, type Col, Court, ShareButton } from '../components/ui'
import { lum, mix, palette, valColor } from '../lib/color'
import { BOX0, S, compOf, loadEd, loadGame, useLoad, type BoxRow, type EdFile, type GameRec, type Meta, type TeamE } from '../lib/data'
import { dateLong, minutes, pct, time, val } from '../lib/fmt'
import { href } from '../lib/router'
import { roundName } from '../lib/stats'

export default function Game({ meta, refId }: { meta: Meta; refId: string }) {
  const g = useLoad(() => loadGame(refId), [refId])
  const ed = useLoad(() => (g && !(g instanceof Error) ? loadEd(g.ed) : Promise.resolve(undefined)), [g])
  if (g === undefined || (g && !(g instanceof Error) && ed === undefined)) return <Loading />
  if (!g || g instanceof Error || !ed || ed instanceof Error) return <NotFound what="Partido" />
  return <GamePage meta={meta} g={g} ed={ed} refId={refId} />
}

const ln = (r: BoxRow) => r.slice(BOX0) as (number | null)[]
const sum = (rows: BoxRow[]) => rows.reduce((a, r) => (ln(r).forEach((v, i) => (a[i] += v ?? 0)), a), new Array(19).fill(0) as number[])

function GamePage({ meta, g, ed, refId }: { meta: Meta; g: GameRec; ed: EdFile; refId: string }) {
  const row = ed.games.find((x) => x.id === refId)
  const tm = new Map(ed.teams.map((t) => [t.id, t]))
  const comp = compOf(meta, ed.code)
  const h = row ? tm.get(row.h) : undefined
  const a = row ? tm.get(row.a) : undefined
  useEffect(() => {
    if (h && a) document.title = `${h.short ?? h.name} - ${a.short ?? a.name} · d3 basket`
  }, [h, a])
  if (!row || !h || !a) return <NotFound what="Partido" />
  const ph = palette(h.c1, h.c2)
  const pa0 = palette(a.c1, a.c2)
  const away = awayColor(ph.dk, pa0)
  const pa = away === pa0.dk ? pa0 : { dk: away === 'var(--tx3)' ? '#2a2f38' : away, lt: pa0.lt }
  const fin = row.st === 'f' && row.hs != null && row.as != null
  const hw = fin && row.hs! > row.as!
  const box = (t: number) => g.teams[t]?.lines ?? []
  const totals = { h: sum(box(row.h)), a: sum(box(row.a)) }
  const hasBox = box(row.h).length > 0
  const Side = ({ t }: { t: TeamE }) => (
    <a className="side" href={href.club(t.club, ed.y)}>
      <Crest url={t.logo} name={t.name} c1={t.c1} size={120} />
      <b>{t.short ?? t.name}</b>
    </a>
  )
  return (
    <div style={{ ['--c-dk' as string]: ph.dk, ['--c-lt' as string]: ph.lt }}>
      <section className="hero" style={{ background: `linear-gradient(100deg, ${ph.dk} 0%, ${ph.dk} 30%, color-mix(in oklab, ${ph.dk} 50%, ${pa.dk}) 50%, ${pa.dk} 70%, ${pa.dk} 100%)` }}>
        <Court />
        <div className="wrap">
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 22 }}>
            {comp && (
              <a className="kicker" href={href.comp(comp.code, ed.y)}>
                {comp.logo && <img className="lg" src={src(comp.logo)} alt="" />}
                {comp.name} · {roundName(row)}
              </a>
            )}
          </div>
          <div className="hg">
            <Side t={h} />
            <div className="mid">
              {fin ? (
                <div className="big">
                  <span className={hw ? '' : 'dim'}>{row.hs}</span>
                  <i>–</i>
                  <span className={hw ? 'dim' : ''}>{row.as}</span>
                </div>
              ) : (
                <div className="big" style={{ fontSize: 64 }}>
                  {row.st === 'p' ? 'Aplazado' : time(row.d) || 'vs'}
                </div>
              )}
              <div className="st">{fin ? 'Final' : row.st === 'p' ? '' : 'Por jugar'}</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>{row.d ? dateLong(row.d) : ''}</div>
              {(g.ar ?? row.ar) && <div style={{ fontSize: 13, opacity: 0.7 }}>{g.ar ?? row.ar}{g.att ? ` · ${g.att.toLocaleString('es-ES')} espectadores` : ''}</div>}
            </div>
            <Side t={a} />
          </div>
          <div className="hero-actions" style={{ justifyContent: 'center', marginTop: -86, paddingBottom: 70, position: 'relative' }}>
            <ShareButton />
          </div>
        </div>
      </section>
      <main className="wrap page">
        <div className="grid g-12" style={{ marginTop: -60, position: 'relative', zIndex: 2 }}>
          <section className="card">
            <Sec>Marcador</Sec>
            {g.per.length > 0 ? (
              <div className="tw">
                <table className="t">
                  <thead>
                    <tr>
                      <th className="l">Equipo</th>
                      {g.per.map((_, i) => (
                        <th key={i}>{i < 4 ? `${i + 1}.º` : `P${i - 3}`}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [h, 0, row.hs],
                      [a, 1, row.as]
                    ].map(([t, k, tot]) => (
                      <tr key={k as number}>
                        <td className="l">
                          <span className="who">
                            <Crest url={(t as TeamE).logo} name={(t as TeamE).name} c1={(t as TeamE).c1} size={22} />
                            {(t as TeamE).abbr ?? (t as TeamE).short ?? (t as TeamE).name}
                          </span>
                        </td>
                        {g.per.map((p, i) => (
                          <td key={i} style={{ fontWeight: p[k as number] > p[1 - (k as number)] ? 700 : 400, color: p[k as number] > p[1 - (k as number)] ? undefined : 'var(--tx3)' }}>
                            {p[k as number]}
                          </td>
                        ))}
                        <td className="b">{tot as number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">{fin ? 'Sin parciales' : 'Partido sin jugar'}</div>
            )}
            {g.refs.length > 0 && (
              <p className="muted" style={{ marginTop: 14, fontSize: 12.5 }}>
                Árbitros: {g.refs.join(', ')}
              </p>
            )}
          </section>
          <section className="card">
            <Sec>Comparativa</Sec>
            {hasBox ? <Compare h={totals.h} a={totals.a} ch={ph.dk} ca={pa.dk} hn={h.abbr ?? h.short ?? h.name} an={a.abbr ?? a.short ?? a.name} /> : <div className="empty">Sin estadística del partido</div>}
          </section>
        </div>
        {g.per.length > 1 && fin && <Progress per={g.per} ch={ph.dk} ca={pa.dk} hn={h.short ?? h.name} an={a.short ?? a.name} />}
        {hasBox && <Starters g={g} h={h} a={a} hid={row.h} aid={row.a} ch={ph.dk} ca={pa.dk} />}
        {hasBox && <Best g={g} h={h} a={a} hid={row.h} aid={row.a} />}
        {hasBox &&
          [
            [h, row.h],
            [a, row.a]
          ].map(([t, id]) => <Box key={id as number} g={g} t={t as TeamE} id={id as number} />)}
      </main>
      <Foot updated={ed.last ?? meta.updated} />
    </div>
  )
}

/** Color del visitante en la comparativa: si se parece al del local, uno neutro. */
function awayColor(home: string, pa: { dk: string; lt: string }) {
  const close = (x: string, y: string) => Math.abs(lum(x) - lum(y)) < 0.08 && mix(x, y, 0.5) && [1, 3, 5].every((i) => Math.abs(parseInt(x.slice(i, i + 2), 16) - parseInt(y.slice(i, i + 2), 16)) < 70)
  if (!close(home, pa.dk)) return pa.dk
  if (!close(home, pa.lt)) return pa.lt
  return 'var(--tx3)'
}

function Compare({ h, a, ch, ca, hn, an }: { h: number[]; a: number[]; ch: string; ca: string; hn: string; an: string }) {
  const fg = (s: number[]) => [s[S.f2m] + s[S.f3m], s[S.f2a] + s[S.f3a]]
  const rows: [string, number, number, string, string][] = [
    ['Tiros de campo', pct(...(fg(h) as [number, number])) ?? 0, pct(...(fg(a) as [number, number])) ?? 0, `${fg(h)[0]}/${fg(h)[1]}`, `${fg(a)[0]}/${fg(a)[1]}`],
    ['Triples', pct(h[S.f3m], h[S.f3a]) ?? 0, pct(a[S.f3m], a[S.f3a]) ?? 0, `${h[S.f3m]}/${h[S.f3a]}`, `${a[S.f3m]}/${a[S.f3a]}`],
    ['Tiros libres', pct(h[S.ftm], h[S.fta]) ?? 0, pct(a[S.ftm], a[S.fta]) ?? 0, `${h[S.ftm]}/${h[S.fta]}`, `${a[S.ftm]}/${a[S.fta]}`],
    ['Rebotes', h[S.reb], a[S.reb], '', ''],
    ['Asistencias', h[S.ast], a[S.ast], '', ''],
    ['Robos', h[S.stl], a[S.stl], '', ''],
    ['Pérdidas', h[S.tov], a[S.tov], '', ''],
    ['Valoración', val(h), val(a), '', '']
  ]
  return (
    <div className="cmp">
      <div className="r" style={{ marginBottom: -4 }}>
        <b style={{ font: '700 14px var(--cond)', letterSpacing: '.08em', color: ch }}>{hn}</b>
        <span />
        <b style={{ font: '700 14px var(--cond)', letterSpacing: '.08em', color: ca, textAlign: 'right' }}>{an}</b>
      </div>
      {rows.map(([k, x, y, dx, dy]) => {
        const isPct = dx !== ''
        const max = isPct ? 100 : Math.max(1, Math.abs(x), Math.abs(y))
        return (
          <div className="r" key={k}>
            <b title={dx}>{isPct ? `${x}%` : x}</b>
            <span className="k">{k}</span>
            <b title={dy}>{isPct ? `${y}%` : y}</b>
            <div className="bars">
              <i style={{ ['--w' as string]: `${(100 * Math.max(0, x)) / max}%`, ['--col' as string]: ch }} />
              <i style={{ ['--w' as string]: `${(100 * Math.max(0, y)) / max}%`, ['--col' as string]: ca }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Best({ g, h, a, hid, aid }: { g: GameRec; h: TeamE; a: TeamE; hid: number; aid: number }) {
  const top = useMemo(
    () =>
      [
        ...(g.teams[hid]?.lines ?? []).map((r) => ({ r, t: h })),
        ...(g.teams[aid]?.lines ?? []).map((r) => ({ r, t: a }))
      ]
        .sort((x, y) => val(ln(y.r)) - val(ln(x.r)))
        .slice(0, 4),
    [g, h, a, hid, aid]
  )
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <Sec aside="por valoración">Mejores del partido</Sec>
      <div className="best">
        {top.map(({ r, t }) => {
          const s = ln(r)
          const nm = g.names[r[0]]
          return (
            <a className="bp" key={r[0]} href={href.player(r[0])}>
              <Avatar url={nm?.[1]} name={nm?.[0] ?? '?'} size={64} />
              <div style={{ minWidth: 0 }}>
                <div className="nm">{nm?.[0]}</div>
                <div className="sub">
                  <Crest url={t.logo} name={t.name} c1={t.c1} size={16} />
                  {t.short ?? t.name}
                </div>
                <div className="line">
                  <b>{s[S.pts]}</b> pts · <b>{s[S.reb]}</b> reb · <b>{s[S.ast]}</b> ast
                </div>
              </div>
              <span className="badge" style={{ background: valColor(val(s)), fontSize: 18, height: 34, minWidth: 44 }}>
                {val(s)}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function Box({ g, t, id }: { g: GameRec; t: TeamE; id: number }) {
  const rows = g.teams[id]?.lines ?? []
  const nm = (r: BoxRow) => g.names[r[0]]
  const s = (r: BoxRow) => ln(r)
  const shot = (m: number, at: number) => `${s0(m)}/${s0(at)}`
  const s0 = (v: number | null) => v ?? 0
  const cols: Col<BoxRow>[] = [
    { k: 'num', label: '#', l: true, asc: true, get: (r) => Number(r[1]) || 999, fmt: (r) => <span className="muted">{r[1]}</span> },
    {
      k: 'name',
      label: 'Jugador',
      l: true,
      asc: true,
      get: (r) => nm(r)?.[0] ?? '',
      fmt: (r) => (
        <span className="who">
          <Avatar url={nm(r)?.[1]} name={nm(r)?.[0] ?? '?'} size={30} />
          <span>
            {nm(r)?.[0]}
            {r[2] ? <small>Titular</small> : null}
          </span>
        </span>
      )
    },
    { k: 'min', label: 'Min', get: (r) => s(r)[S.sec] ?? 0, fmt: (r) => minutes(s(r)[S.sec] ?? 0) },
    { k: 'pts', label: 'Pts', b: true, get: (r) => s(r)[S.pts] },
    { k: 't2', label: 'T2', hideM: true, get: (r) => s(r)[S.f2m], fmt: (r) => shot(s(r)[S.f2m]!, s(r)[S.f2a]!) },
    { k: 't3', label: 'T3', get: (r) => s(r)[S.f3m], fmt: (r) => shot(s(r)[S.f3m]!, s(r)[S.f3a]!) },
    { k: 'tl', label: 'TL', hideM: true, get: (r) => s(r)[S.ftm], fmt: (r) => shot(s(r)[S.ftm]!, s(r)[S.fta]!) },
    { k: 'reb', label: 'Reb', get: (r) => s(r)[S.reb] },
    { k: 'ast', label: 'Ast', get: (r) => s(r)[S.ast] },
    { k: 'stl', label: 'Rob', hideM: true, get: (r) => s(r)[S.stl] },
    { k: 'blk', label: 'Tap', hideM: true, get: (r) => s(r)[S.blk] },
    { k: 'tov', label: 'Pér', hideM: true, get: (r) => s(r)[S.tov] },
    { k: 'pf', label: 'Fal', hideM: true, get: (r) => s(r)[S.pf] },
    { k: 'pm', label: '+/-', hideM: true, get: (r) => s(r)[S.pm], fmt: (r) => (s(r)[S.pm] == null ? '–' : `${s(r)[S.pm]! > 0 ? '+' : ''}${s(r)[S.pm]}`) },
    { k: 'val', label: 'Val', get: (r) => val(s(r)), fmt: (r) => <span className="badge" style={{ background: valColor(val(s(r))) }}>{val(s(r))}</span> }
  ]
  const p = palette(t.c1, t.c2)
  return (
    <section className="card" style={{ marginTop: 20, ['--c-dk' as string]: p.dk, ['--c-lt' as string]: p.lt }}>
      <Sec aside={g.teams[id]?.coach ? `Entrenador: ${g.teams[id].coach}` : undefined}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Crest url={t.logo} name={t.name} c1={t.c1} size={28} />
          {t.name}
        </span>
      </Sec>
      <SortTable rows={rows} cols={cols} initial="num" onRow={(r) => href.player(r[0])} />
    </section>
  )
}

/** Marcador acumulado al final de cada cuarto (y prórrogas) y la ventaja en cada momento. */
function Progress({ per, ch, ca, hn, an }: { per: [number, number][]; ch: string; ca: string; hn: string; an: string }) {
  const cum: [number, number][] = [[0, 0]]
  for (const [x, y] of per) cum.push([cum.at(-1)![0] + x, cum.at(-1)![1] + y])
  const W = 760
  const H = 230
  const max = Math.max(...cum.map(([x, y]) => Math.max(x, y))) * 1.08
  const X = (i: number) => 44 + (i * (W - 220)) / (cum.length - 1)
  const Y = (v: number) => 16 + (H - 50) * (1 - v / max)
  const path = (k: 0 | 1) => cum.map((c, i) => `${i ? 'L' : 'M'}${X(i)},${Y(c[k])}`).join(' ')
  const label = (i: number) => (i === 0 ? 'Inicio' : i <= 4 ? `${i}.º` : `P${i - 4}`)
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <Sec aside="marcador acumulado al final de cada cuarto">Evolución del marcador</Sec>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Evolución del marcador por cuartos">
        {cum.map((c, i) => (
          <g key={i}>
            <line x1={X(i)} x2={X(i)} y1={12} y2={H - 34} className="grid" />
            <text x={X(i)} y={H - 16} className="lab" textAnchor="middle">
              {label(i)}
            </text>
            {i > 0 && (
              <text x={X(i)} y={H - 2} className="sub" textAnchor="middle">
                {c[0] - c[1] > 0 ? '+' : ''}
                {c[0] - c[1]}
              </text>
            )}
          </g>
        ))}
        <path d={path(0)} fill="none" stroke={ch} strokeWidth={3.5} strokeLinejoin="round" />
        <path d={path(1)} fill="none" stroke={ca} strokeWidth={3.5} strokeLinejoin="round" />
        {cum.slice(1).map((c, i) => (
          <g key={i}>
            <circle cx={X(i + 1)} cy={Y(c[0])} r={4.5} fill={ch} />
            <circle cx={X(i + 1)} cy={Y(c[1])} r={4.5} fill={ca} />
          </g>
        ))}
        {(() => {
          // Etiquetas finales a la derecha, separadas si los marcadores están muy cerca.
          let yh = Y(cum.at(-1)![0])
          let ya = Y(cum.at(-1)![1])
          if (Math.abs(yh - ya) < 22) {
            const mid = (yh + ya) / 2
            const up = yh <= ya
            yh = mid + (up ? -11 : 11)
            ya = mid + (up ? 11 : -11)
          }
          return (
            <>
              <text x={X(cum.length - 1) + 14} y={yh + 5} className="val" fill={ch}>
                {hn} {cum.at(-1)![0]}
              </text>
              <text x={X(cum.length - 1) + 14} y={ya + 5} className="val" fill={ca}>
                {an} {cum.at(-1)![1]}
              </text>
            </>
          )
        })()}
      </svg>
    </section>
  )
}

/** Quintetos iniciales de los dos equipos. */
function Starters({ g, h, a, hid, aid, ch, ca }: { g: GameRec; h: TeamE; a: TeamE; hid: number; aid: number; ch: string; ca: string }) {
  const five = (id: number) => (g.teams[id]?.lines ?? []).filter((r) => r[2])
  if (five(hid).length < 5 && five(aid).length < 5) return null
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <Sec>Quintetos iniciales</Sec>
      <div className="g-2 grid" style={{ marginTop: 0 }}>
        {[
          [h, hid, ch],
          [a, aid, ca]
        ].map(([t, id, c]) => (
          <div key={id as number} className="five" style={{ ['--fc' as string]: c as string }}>
            <div className="five-h">
              <Crest url={(t as TeamE).logo} name={(t as TeamE).name} c1={(t as TeamE).c1} size={24} />
              {(t as TeamE).short ?? (t as TeamE).name}
            </div>
            <div className="five-p">
              {five(id as number).map((r) => {
                const nm = g.names[r[0]]
                return (
                  <a key={r[0]} href={href.player(r[0])}>
                    <Avatar url={nm?.[1]} name={nm?.[0] ?? '?'} size={58} />
                    <b>{r[1]}</b>
                    <span>{nm?.[0]?.split(' ').slice(-1)[0]}</span>
                  </a>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
