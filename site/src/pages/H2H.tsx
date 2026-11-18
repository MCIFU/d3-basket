/** Cara a cara entre dos clubes: todos sus partidos en cualquier competición, balance y mayores palizas. */
import { useEffect, useMemo } from 'react'
import { Court, Crest, Foot, Loading, NotFound, Sec, Strip } from '../components/ui'
import { palette } from '../lib/color'
import { compOf, h2hKey, loadH2H, useLoad, type H2HRec, type Meta } from '../lib/data'
import { dateShort, dateYear, n1, seasonLabel } from '../lib/fmt'
import { href } from '../lib/router'

export default function H2H({ meta, a, b }: { meta: Meta; a: string; b: string }) {
  const r = useLoad(() => loadH2H(a, b), [a, b])
  if (r === undefined) return <Loading />
  if (!r || r instanceof Error) return <NotFound what="Cara a cara" />
  return <Page meta={meta} r={r} a={a} b={b} />
}

/** Partido visto desde el club «x» (el primero de la URL). */
interface G {
  ref: string
  d: string
  code: string
  y: number
  home: boolean
  pts: number
  opp: number
  rn: string | null
}

function Page({ meta, r, a, b }: { meta: Meta; r: H2HRec; a: string; b: string }) {
  // Los datos van en orden alfabético de referencia; la página, en el orden de la URL.
  const flip = h2hKey(a, b).split('|')[0] !== a
  const X = flip ? r.b : r.a
  const Y = flip ? r.a : r.b
  const games: G[] = useMemo(
    () => r.games.map(([ref, d, code, y, aHome, pa, pb, rn]) => ({ ref, d, code, y, home: flip ? !aHome : !!aHome, pts: flip ? pb : pa, opp: flip ? pa : pb, rn })),
    [r, flip]
  )
  useEffect(() => {
    document.title = `${X[1] ?? X[0]} - ${Y[1] ?? Y[0]} · cara a cara · d3 basket`
  }, [X, Y])
  const w = games.filter((g) => g.pts > g.opp).length
  const l = games.length - w
  const px = palette(X[3], null, '#0a2a5c')
  let py = palette(Y[3], null, '#7a0f1c')
  if (px.dk === py.dk) py = { dk: '#7a0f1c', lt: '#e8b100' }
  const byComp = [...new Set(games.map((g) => g.code))].map((code) => {
    const gs = games.filter((g) => g.code === code)
    return { code, n: gs.length, w: gs.filter((g) => g.pts > g.opp).length, from: Math.min(...gs.map((g) => g.y)), to: Math.max(...gs.map((g) => g.y)) }
  })
  const order = meta.comps.map((c) => c.code)
  byComp.sort((p, q) => q.n - p.n || order.indexOf(p.code) - order.indexOf(q.code))
  const big = (mine: boolean) =>
    games
      .filter((g) => (mine ? g.pts > g.opp : g.opp > g.pts))
      .sort((p, q) => Math.abs(q.pts - q.opp) - Math.abs(p.pts - p.opp))
      .slice(0, 3)
  const avg = (f: (g: G) => number) => (games.length ? games.reduce((s, g) => s + f(g), 0) / games.length : null)
  const last = games[0]
  const seasons = [...new Set(games.map((g) => g.y))]
  const name = (t: H2HRec['a']) => t[1] ?? t[0]
  const Side = ({ t, refId }: { t: H2HRec['a']; refId: string }) => (
    <a className="vs-side" href={href.club(refId)}>
      <span className="h2h-crest">
        <Crest url={t[2]} name={t[0]} c1={t[3]} size={96} />
      </span>
      <b>{t[0]}</b>
    </a>
  )
  const Row = ({ g }: { g: G }) => {
    const c = compOf(meta, g.code)
    const hn = g.home ? name(X) : name(Y)
    const an = g.home ? name(Y) : name(X)
    const hp = g.home ? g.pts : g.opp
    const ap = g.home ? g.opp : g.pts
    return (
      <a href={href.game(g.ref)} className="h2h-r">
        <span className="muted">{dateYear(g.d)}</span>
        <span className="lgp">{c?.short ?? c?.name ?? g.code}</span>
        <b className={hp > ap ? 'w' : ''}>{hn}</b>
        <strong>
          {hp}-{ap}
        </strong>
        <b className={ap > hp ? 'w' : ''}>{an}</b>
        <span className={`muted ${g.pts > g.opp ? '' : ''}`}>{g.rn ?? ''}</span>
      </a>
    )
  }
  return (
    <div>
      <section className="hero short" style={{ background: `linear-gradient(100deg, ${px.dk} 0%, ${px.dk} 40%, ${py.dk} 60%, ${py.dk} 100%)` }}>
        <Court />
        <div className="wrap">
          <div className="vs">
            <Side t={X} refId={a} />
            <div className="vs-mid h2h-mid">
              <span className="h2h-score">
                {w}
                <i>-</i>
                {l}
              </span>
              <small>
                {games.length} partidos · {seasons.length} {seasons.length === 1 ? 'temporada' : 'temporadas'}
              </small>
            </div>
            <Side t={Y} refId={b} />
          </div>
        </div>
      </section>
      <main className="wrap page">
        <Strip
          items={[
            { k: 'Partidos', v: String(games.length) },
            { k: `Victorias ${name(X)}`, v: String(w), bar: games.length ? (100 * w) / games.length : 0 },
            { k: `Victorias ${name(Y)}`, v: String(l) },
            { k: 'Puntos por partido', v: `${n1(avg((g) => g.pts))}-${n1(avg((g) => g.opp))}` }
          ]}
          note={
            last ? (
              <a href={href.game(last.ref)} style={{ display: 'grid', gap: 4 }}>
                <b>Último: {last.pts > last.opp ? name(X) : name(Y)}</b>
                <span>
                  {last.home ? `${last.pts}-${last.opp}` : `${last.opp}-${last.pts}`} · {dateShort(last.d)} {dateYear(last.d).slice(-4)}
                </span>
              </a>
            ) : undefined
          }
        />
        <div className="grid g-2" style={{ marginTop: 22 }}>
          <section className="card">
            <Sec aside="balance en cada competición">Por competición</Sec>
            <div className="tw">
              <table className="t">
                <thead>
                  <tr>
                    <th className="l">Competición</th>
                    <th>Temporadas</th>
                    <th>PJ</th>
                    <th>{name(X)}</th>
                    <th>{name(Y)}</th>
                  </tr>
                </thead>
                <tbody>
                  {byComp.map((c) => {
                    const comp = compOf(meta, c.code)
                    return (
                      <tr key={c.code}>
                        <td className="l">
                          <a href={href.comp(c.code)}>{comp?.name ?? c.code}</a>
                        </td>
                        <td className="muted">{c.from === c.to ? seasonLabel(c.from) : `${c.from}-${String(c.to + 1).slice(2)}`}</td>
                        <td>{c.n}</td>
                        <td className={c.w > c.n - c.w ? 'b' : ''}>{c.w}</td>
                        <td className={c.n - c.w > c.w ? 'b' : ''}>{c.n - c.w}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <Sec aside="mayor diferencia de cada lado">Mayores palizas</Sec>
            {[
              [X, true],
              [Y, false]
            ].map(([t, mine]) => {
              const list = big(mine as boolean)
              return (
                <div key={String(mine)} style={{ marginBottom: 12 }}>
                  <h3 className="ph3">{name(t as H2HRec['a'])}</h3>
                  {list.length ? (
                    <div className="h2h">
                      {list.map((g) => (
                        <Row key={g.ref} g={g} />
                      ))}
                    </div>
                  ) : (
                    <div className="muted">Sin victorias</div>
                  )}
                </div>
              )
            })}
          </section>
        </div>
        <section className="card" style={{ marginTop: 22 }}>
          <Sec aside={`${games.length} partidos, del más reciente al más antiguo`}>Todos los partidos</Sec>
          <div className="h2h">
            {games.map((g) => (
              <Row key={g.ref} g={g} />
            ))}
          </div>
        </section>
      </main>
      <Foot updated={meta.updated} />
    </div>
  )
}
