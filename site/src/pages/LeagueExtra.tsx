/** Pestañas extra de una liga: eliminatorias, evolución de la clasificación y récords de la temporada. */
import { useMemo, useState } from 'react'
import { Avatar, Crest, Loading, Sec } from '../components/ui'
import { palette } from '../lib/color'
import { loadHist, useLoad, type EdFile, type GameE, type HistFile, type TeamE } from '../lib/data'
import { dateShort, dateYear, n0, n1, seasonLabel } from '../lib/fmt'
import { href } from '../lib/router'

const KO = ['playin', 'playoff', 'final_four', 'final']
/** Nombre de la ronda sin el número de partido («Cuartos de final · Partido 2» → «Cuartos de final»). */
const stageOf = (g: GameE) => (g.rn ?? (g.ph === 'final_four' ? 'Final Four' : g.ph === 'playin' ? 'Play-in' : g.ph === 'final' ? 'Final' : 'Playoff')).split(' · ')[0]

export const hasKnockout = (ed: EdFile) => ed.games.some((g) => KO.includes(g.ph))
export const hasEvolution = (ed: EdFile) => !ed.stand.some((s) => s.g) && new Set(ed.games.filter((g) => g.ph === 'regular' && g.st === 'f').map((g) => g.r)).size >= 3

// ───────────────────────── Eliminatorias ─────────────────────────
interface Series {
  a: number
  b: number
  wa: number
  wb: number
  games: GameE[]
}
export function Bracket({ ed, tm }: { ed: EdFile; tm: Map<number, TeamE> }) {
  const stages = useMemo(() => {
    const ko = ed.games.filter((g) => KO.includes(g.ph)).sort((x, y) => (x.d ?? '').localeCompare(y.d ?? ''))
    const order: string[] = []
    const by = new Map<string, Map<string, Series>>()
    for (const g of ko) {
      const st = stageOf(g)
      if (!by.has(st)) (by.set(st, new Map()), order.push(st))
      const key = [g.h, g.a].sort((x, y) => x - y).join('-')
      const m = by.get(st)!
      const s = m.get(key) ?? { a: g.h, b: g.a, wa: 0, wb: 0, games: [] }
      s.games.push(g)
      if (g.st === 'f' && g.hs != null && g.as != null) {
        const winner = g.hs > g.as ? g.h : g.a
        if (winner === s.a) s.wa++
        else s.wb++
      }
      m.set(key, s)
    }
    return order.map((st) => ({ name: st, series: [...by.get(st)!.values()] }))
  }, [ed])
  const T = ({ id, w, won }: { id: number; w: number; won: boolean }) => {
    const t = tm.get(id)
    return (
      <a className={`bt ${won ? 'won' : ''}`} href={t ? href.club(t.club, ed.y) : undefined}>
        <Crest url={t?.logo} name={t?.name ?? '?'} c1={t?.c1} size={24} />
        <span>{t?.short ?? t?.name}</span>
        <b>{w}</b>
      </a>
    )
  }
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec aside="series y resultados de cada ronda">Eliminatorias</Sec>
      <div className="bracket">
        {stages.map((st) => (
          <div className="bcol" key={st.name}>
            <h3>{st.name}</h3>
            {st.series.map((s) => {
              const done = s.games.every((g) => g.st === 'f')
              const single = s.games.length === 1
              const g0 = s.games[0]
              return (
                <div className="bs" key={s.a + '-' + s.b}>
                  <T id={s.a} w={single && g0.hs != null ? (g0.h === s.a ? g0.hs : g0.as!) : s.wa} won={done && s.wa > s.wb} />
                  <T id={s.b} w={single && g0.hs != null ? (g0.h === s.b ? g0.hs : g0.as!) : s.wb} won={done && s.wb > s.wa} />
                  <div className="bg">
                    {s.games.map((g) => (
                      <a key={g.id} href={href.game(g.id)} title={dateShort(g.d)}>
                        {g.st === 'f' ? `${tm.get(g.h)?.abbr ?? ''} ${g.hs}-${g.as}` : dateShort(g.d)}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

// ───────────────────────── Evolución de la clasificación ─────────────────────────
export function Evolution({ ed, tm }: { ed: EdFile; tm: Map<number, TeamE> }) {
  const [hl, setHl] = useState<number | null>(null)
  const data = useMemo(() => {
    const reg = ed.games.filter((g) => g.ph === 'regular' && g.st === 'f' && g.hs != null && g.r != null)
    const rounds = [...new Set(reg.map((g) => g.r!))].sort((a, b) => a - b)
    const rec = new Map<number, { w: number; d: number }>(ed.teams.map((t) => [t.id, { w: 0, d: 0 }]))
    const pos = new Map<number, number[]>(ed.teams.map((t) => [t.id, []]))
    for (const r of rounds) {
      for (const g of reg.filter((x) => x.r === r)) {
        const h = rec.get(g.h)
        const a = rec.get(g.a)
        if (h) (h.w += g.hs! > g.as! ? 1 : 0), (h.d += g.hs! - g.as!)
        if (a) (a.w += g.as! > g.hs! ? 1 : 0), (a.d += g.as! - g.hs!)
      }
      const order = [...rec.entries()].sort((x, y) => y[1].w - x[1].w || y[1].d - x[1].d).map(([id]) => id)
      order.forEach((id, i) => pos.get(id)!.push(i + 1))
    }
    return { rounds, pos }
  }, [ed])
  const n = ed.teams.length
  const W = Math.max(1100, data.rounds.length * 52)
  const H = n * 30 + 30
  const x = (i: number) => 40 + (i * (W - 230)) / Math.max(1, data.rounds.length - 1)
  const y = (p: number) => 16 + (p - 1) * 30
  const final = [...data.pos.entries()].sort((a, b) => (a[1].at(-1) ?? 99) - (b[1].at(-1) ?? 99))
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec aside="puesto tras cada jornada · pasa el ratón por un equipo">Evolución de la clasificación</Sec>
      <div className="tw">
        <svg className="evo" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} role="img" aria-label="Puesto de cada equipo jornada a jornada">
          {data.rounds.map((r, i) => (
            <text key={r} x={x(i)} y={H - 4} className="tick" textAnchor="middle">
              J{r}
            </text>
          ))}
          {Array.from({ length: n }, (_, i) => (
            <text key={i} x={14} y={y(i + 1) + 4} className="tick" textAnchor="middle">
              {i + 1}
            </text>
          ))}
          {final.map(([id, ps]) => {
            const t = tm.get(id)
            const c = palette(t?.c1, t?.c2).dk
            const on = hl == null || hl === id
            const d = ps.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p)}`).join(' ')
            return (
              <g key={id} onMouseEnter={() => setHl(id)} onMouseLeave={() => setHl(null)} style={{ opacity: on ? 1 : 0.12, transition: 'opacity .2s', cursor: 'pointer' }}>
                <path d={d} fill="none" stroke={c} strokeWidth={hl === id ? 4 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
                {ps.map((p, i) => (
                  <circle key={i} cx={x(i)} cy={y(p)} r={hl === id ? 4.5 : 3} fill={c} />
                ))}
                <text x={x(ps.length - 1) + 12} y={y(ps.at(-1) ?? 1) + 4} className="evo-l">
                  {t?.short ?? t?.name}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

// ───────────────────────── Récords y rachas ─────────────────────────
const TOP: [string, string][] = [
  ['pts', 'Puntos'],
  ['val', 'Valoración'],
  ['reb', 'Rebotes'],
  ['ast', 'Asistencias'],
  ['f3m', 'Triples'],
  ['stl', 'Robos']
]
export function Records({ ed, tm }: { ed: EdFile; tm: Map<number, TeamE> }) {
  const streaks = useMemo(() => {
    const out: { t: number; best: number; cur: number; curW: boolean }[] = []
    for (const t of ed.teams) {
      const gs = ed.games.filter((g) => g.st === 'f' && g.hs != null && (g.h === t.id || g.a === t.id)).sort((a, b) => (a.d ?? '').localeCompare(b.d ?? ''))
      let best = 0
      let run = 0
      let cur = 0
      let curW = true
      for (const g of gs) {
        const won = (g.h === t.id) === g.hs! > g.as!
        run = won ? run + 1 : 0
        best = Math.max(best, run)
        if (cur === 0 || won === curW) cur++
        else cur = 1
        curW = won
      }
      out.push({ t: t.id, best, cur, curW })
    }
    return out
  }, [ed])
  const fin = ed.games.filter((g) => g.st === 'f' && g.hs != null)
  const bigWin = [...fin].sort((a, b) => Math.abs(b.hs! - b.as!) - Math.abs(a.hs! - a.as!))[0]
  const highest = [...fin].sort((a, b) => b.hs! + b.as! - (a.hs! + a.as!))[0]
  const longest = [...streaks].sort((a, b) => b.best - a.best)[0]
  const hot = [...streaks].filter((s) => s.curW).sort((a, b) => b.cur - a.cur)[0]
  const Team = ({ id, abbr }: { id: number; abbr?: boolean }) => {
    const t = tm.get(id)
    return (
      <span className="who" title={t?.name}>
        <Crest url={t?.logo} name={t?.name ?? '?'} c1={t?.c1} size={22} />
        {abbr ? (t?.abbr ?? t?.short ?? t?.name) : (t?.short ?? t?.name)}
      </span>
    )
  }
  const GameLine = ({ g }: { g: GameE }) => (
    <a href={href.game(g.id)} className="rec-g">
      <Team id={g.h} abbr /> <b>{g.hs}-{g.as}</b> <Team id={g.a} abbr />
    </a>
  )
  return (
    <>
      <section className="card" style={{ marginTop: 22 }}>
        <Sec aside={`temporada ${ed.label}`}>Equipos</Sec>
        <div className="recs4">
          {longest && longest.best > 1 && (
            <div className="rc">
              <span className="k">Racha más larga de victorias</span>
              <b>{longest.best}</b>
              <Team id={longest.t} />
            </div>
          )}
          {hot && hot.cur > 1 && (
            <div className="rc">
              <span className="k">Racha actual</span>
              <b>{hot.cur} victorias</b>
              <Team id={hot.t} />
            </div>
          )}
          {bigWin && (
            <div className="rc">
              <span className="k">Mayor diferencia</span>
              <b>+{Math.abs(bigWin.hs! - bigWin.as!)}</b>
              <GameLine g={bigWin} />
            </div>
          )}
          {highest && (
            <div className="rc">
              <span className="k">Partido con más puntos</span>
              <b>{highest.hs! + highest.as!}</b>
              <GameLine g={highest} />
            </div>
          )}
        </div>
      </section>
      {ed.top && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec aside="mejores marcas en un solo partido">Jugadores</Sec>
          <div className="leaders" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {TOP.filter(([k]) => ed.top?.[k]?.length).map(([k, label]) => {
              const [first, ...rest] = ed.top![k]
              const p1 = ed.pl[first.p]
              return (
                <div className="ldr" key={k}>
                  <h3>{label}</h3>
                  <a className="first" href={href.game(first.g)}>
                    <Avatar url={p1?.[1]} name={p1?.[0] ?? '?'} size={52} />
                    <span className="nm">
                      {p1?.[0]}
                      <small>
                        vs {tm.get(first.opp)?.short ?? tm.get(first.opp)?.name} · {dateShort(first.d)}
                      </small>
                    </span>
                    <span className="v">{first.v}</span>
                  </a>
                  {rest.slice(0, 4).map((r, i) => {
                    const t = tm.get(r.t)
                    return (
                      <a className="row" key={r.p + r.g} href={href.game(r.g)}>
                        <i>{i + 2}</i>
                        <Crest url={t?.logo} name={t?.name ?? ''} c1={t?.c1} size={20} />
                        <span>{ed.pl[r.p]?.[0]}</span>
                        <b>{r.v}</b>
                      </a>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

// ───────────────────────── Histórico: líderes y récords de siempre ─────────────────────────
const HSTATS: [string, string, string][] = [
  ['pts', 'Puntos', 'pts'],
  ['reb', 'Rebotes', 'reb'],
  ['ast', 'Asistencias', 'ast'],
  ['val', 'Valoración', 'val'],
  ['f3m', 'Triples', 'triples'],
  ['stl', 'Robos', 'robos'],
  ['blk', 'Tapones', 'tapones'],
  ['gp', 'Partidos', 'partidos'],
  ['min', 'Minutos', 'min']
]
export function Historic({ code }: { code: string }) {
  const h = useLoad(() => loadHist(code), [code])
  if (h === undefined) return <Loading />
  if (!h || h instanceof Error) return <div className="card empty">Sin histórico para esta competición</div>
  return <HistoricView h={h} />
}
function HistoricView({ h }: { h: HistFile }) {
  const [k, setK] = useState('pts')
  const [mode, setMode] = useState<'tot' | 'avg'>('tot')
  const m = k === 'gp' ? 'tot' : mode
  const rows = (m === 'tot' ? h.tot[k] : h.avg[k]) ?? []
  const label = HSTATS.find((x) => x[0] === k)!
  const span = (a: number, b: number) => (a === b ? seasonLabel(a) : `${a}-${String(b + 1).slice(2)}`)
  return (
    <>
      <section className="card">
        <Sec aside={`${n0(h.players)} jugadores · desde ${seasonLabel(h.from)}`}>Líderes de siempre</Sec>
        <div className="chips" style={{ marginBottom: 10 }}>
          {HSTATS.map(([key, l]) => (
            <button key={key} className={`chip ${k === key ? 'on' : ''}`} onClick={() => setK(key)}>
              {l}
            </button>
          ))}
        </div>
        {k !== 'gp' && (
          <div className="chips" style={{ marginBottom: 14 }}>
            <button className={`chip ${mode === 'tot' ? 'on' : ''}`} onClick={() => setMode('tot')}>
              Totales
            </button>
            <button className={`chip ${mode === 'avg' ? 'on' : ''}`} onClick={() => setMode('avg')}>
              Por partido · mín. {h.minGp} partidos
            </button>
          </div>
        )}
        <div className="hist">
          {rows.slice(0, 25).map(([p, v, gp, y0, y1], i) => {
            const pl = h.pl[p]
            const t = h.tm[h.lt[p]]
            return (
              <a key={p} className={`hist-r ${i < 3 ? 'lead' : ''}`} href={href.player(p)}>
                <i>{i + 1}</i>
                <Avatar url={pl?.[1]} name={pl?.[0] ?? '?'} size={i < 3 ? 46 : 34} />
                <span>
                  <b>{pl?.[0]}</b>
                  <small>
                    {t && <Crest url={t.l} name={t.n} c1={t.c1} size={14} />} {t?.s ?? t?.n} · {span(y0, y1)} · {n0(gp)} partidos
                  </small>
                </span>
                <em>
                  {m === 'avg' ? n1(v) : n0(v)}
                  <small>{m === 'avg' ? `${label[2]}/p` : label[2]}</small>
                </em>
              </a>
            )
          })}
        </div>
      </section>
      {Object.keys(h.top).length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec aside="mejores marcas en un partido, todas las temporadas">Récords de siempre</Sec>
          <div className="leaders" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {TOP.filter(([key]) => h.top[key]?.length).map(([key, l]) => {
              const [first, ...rest] = h.top[key]
              const p1 = h.pl[first.p]
              return (
                <div className="ldr" key={key}>
                  <h3>{l}</h3>
                  <a className="first" href={href.game(first.g)}>
                    <Avatar url={p1?.[1]} name={p1?.[0] ?? '?'} size={52} />
                    <span className="nm">
                      {p1?.[0]}
                      <small>
                        vs {h.tm[first.opp]?.s ?? h.tm[first.opp]?.n} · {dateYear(first.d)}
                      </small>
                    </span>
                    <span className="v">{first.v}</span>
                  </a>
                  {rest.slice(0, 5).map((r, i) => {
                    const t = h.tm[r.t]
                    return (
                      <a className="row" key={r.p + r.g} href={href.game(r.g)}>
                        <i>{i + 2}</i>
                        <Crest url={t?.l} name={t?.n ?? ''} c1={t?.c1} size={20} />
                        <span>
                          {h.pl[r.p]?.[0]} <small className="muted">{seasonLabel(r.y)}</small>
                        </span>
                        <b>{r.v}</b>
                      </a>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
