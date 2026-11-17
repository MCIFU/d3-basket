import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MedalSummary, Medals } from '../components/Medals'
import { BarChart, Crest, Foot, Loading, NotFound, Radar, Sec, SortTable, Strip, Tabs, src, type Col, Court, FavButton } from '../components/ui'
import { cssVars, palette, pctColor, valColor } from '../lib/color'
import { LOG0, S, compOf, loadEd, loadPlayer, useLoad, type LogRow, type Meta, type PlayerRec, type Season } from '../lib/data'
import { age, dateShort, dateYear, dob, feet, flag, fga, height, n0, n1, pct, per, POS, seasonLabel, val } from '../lib/fmt'
import { href, useQuery } from '../lib/router'
import { percentiles } from '../lib/stats'

const line = (r: LogRow) => r.slice(LOG0) as (number | null)[]
const SECTION_NAME: Record<Season['sec'], string> = { liga: 'Liga', filial: 'Filial', copa: 'Copa', europa: 'Europa', seleccion: 'Selección autonómica', formacion: 'Formación' }

export default function Player({ refId, meta }: { refId: string; meta: Meta }) {
  const p = useLoad(() => loadPlayer(refId), [refId])
  if (p === undefined) return <Loading />
  if (!p || p instanceof Error) return <NotFound what="Jugador" />
  return <PlayerPage p={p} meta={meta} key={p.ref} />
}

function PlayerPage({ p, meta }: { p: PlayerRec; meta: Meta }) {
  const [tab, setTab] = useQuery('v', 'resumen')
  // Temporada principal: la de su equipo actual o la más reciente con partidos.
  const boxSeasons = p.seasons.filter((s) => s.ed != null)
  const curEd = p.cur?.ed ?? boxSeasons[0]?.ed ?? null
  const ed = useLoad(() => (curEd ? loadEd(curEd) : Promise.resolve(undefined)), [curEd])
  const edFile = ed && !(ed instanceof Error) ? ed : undefined
  const comp = p.cur ? compOf(meta, p.cur.code) : boxSeasons[0] ? compOf(meta, boxSeasons[0].code) : undefined
  const team = p.cur ? p.tm[p.cur.t] : undefined
  const pal = palette(team?.c1, team?.c2, comp?.color2 ?? comp?.color ?? undefined)
  const seasonLines = boxSeasons.filter((s) => s.ed === curEd)
  const cur = seasonLines.length
    ? seasonLines.reduce((a, s) => ({ ...a, gp: a.gp + s.gp, w: a.w + s.w, gs: a.gs + s.gs, s: a.s.map((v, i) => (v ?? 0) + (s.s[i] ?? 0)) }), { ...seasonLines[0], gp: 0, w: 0, gs: 0, s: new Array(19).fill(0) as (number | null)[] })
    : undefined
  const games = useMemo(() => p.log.filter((r) => r[1] === curEd), [p.log, curEd])
  const pc = useMemo(() => (edFile ? percentiles(edFile, p.ref) : null), [edFile, p.ref])
  const avg = cur ? per(cur.s, cur.gp) : undefined
  const first = p.first && p.last && p.name.includes(p.last.split(' ')[0]) ? p.name.replace(new RegExp(`\\s*${p.last.split(' ')[0]}.*$`), '') : p.name.split(' ').slice(0, -1).join(' ')
  const last = first ? p.name.slice(first.length).trim() : p.name
  const pctOf = (k: string) => pc?.items.find((x) => x.k === k)
  const strip = avg
    ? [
        { k: 'Puntos', v: n1(avg.pts), m: 'pts' },
        { k: 'Rebotes', v: n1(avg.reb), m: 'reb' },
        { k: 'Asistencias', v: n1(avg.ast), m: 'ast' },
        { k: 'Valoración', v: n1(avg.val), m: 'val' },
        { k: 'Minutos', v: n1(avg.min), m: '' }
      ].map((x) => {
        const it = x.m ? pctOf(x.m) : undefined
        return { k: x.k, v: x.v, bar: it?.pct, rank: it ? `${it.rank}.º de ${it.of} en la liga` : undefined }
      })
    : []
  useEffect(() => {
    document.title = `${p.name} · d3 basket`
  }, [p.name])
  const a = age(p.birth)
  const pos = p.posc ? POS[p.posc] ?? p.pos : p.pos
  return (
    <div style={cssVars(pal)}>
      <section className="hero">
        <Court />
        <div className="ghost">{last.split(' ').slice(-1)[0]}</div>
        <div className="wrap hp">
          <div className="txt">
            {comp && p.cur && (
              <a className="kicker" href={href.comp(comp.code, p.cur.y)}>
                {comp.logo && <img className="lg" src={src(comp.logo)} alt="" />}
                {comp.name} · {seasonLabel(p.cur.y)}
              </a>
            )}
            <h1 className={last.length > 16 ? 'sm' : last.length > 11 ? 'mid' : ''}>
              {first && <small>{first}</small>}
              {last}
            </h1>
            <dl className="meta">
              {pos && (
                <div>
                  <dt>Posición</dt>
                  <dd>{pos}</dd>
                </div>
              )}
              {a != null && (
                <div>
                  <dt>Edad</dt>
                  <dd>{a} años</dd>
                </div>
              )}
              {p.h && (
                <div>
                  <dt>Altura</dt>
                  <dd>{height(p.h)}</dd>
                </div>
              )}
              {p.nat && (
                <div>
                  <dt>Nacionalidad</dt>
                  <dd>
                    {flag(p.nat)} {p.nat}
                  </dd>
                </div>
              )}
            </dl>
            {team && p.cur && (
              <a className="hero-team" href={href.club(team.c, p.cur.y)}>
                <Crest url={team.l} name={team.n} c1={team.c1} size={46} className="crest" />
                <span>{team.n}</span>
              </a>
            )}
            <div>
              <MedalSummary titles={p.titles ?? []} medals={p.medals ?? []} />
            </div>
            <div className="hero-actions">
              <FavButton fav={{ kind: 'p', ref: p.ref, name: p.name, img: p.photo ?? p.cut }} />
              <a className="fav" href={`#/comparar/${encodeURIComponent(p.ref)}`}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M4 16V8M10 16V4M16 16v-6" />
                </svg>
                Comparar
              </a>
            </div>
          </div>
          <div className="pic">
            {p.cur?.num && <div className="num">#{p.cur.num}</div>}
            <Photo p={p} />
          </div>
        </div>
      </section>
      <main className="wrap page">
        {cur && avg ? (
          <Strip
            items={strip}
            note={
              <>
                <b>
                  {cur.gp} {cur.gp === 1 ? 'partido' : 'partidos'}
                </b>
                <span>
                  {seasonLabel(cur.y)} · {cur.w} {cur.w === 1 ? 'victoria' : 'victorias'} y {cur.gp - cur.w} {cur.gp - cur.w === 1 ? 'derrota' : 'derrotas'} de su equipo · medias por partido
                </span>
              </>
            }
          />
        ) : (
          <Strip items={[]} note={<span>Sin partidos con estadística en la base de datos.</span>} />
        )}
        <Tabs
          value={tab as 'resumen'}
          set={setTab}
          items={[
            ['resumen', 'Resumen'],
            ['partidos', 'Partidos'],
            ['trayectoria', 'Trayectoria'],
            ['ficha', 'Ficha']
          ]}
        />
        {tab === 'resumen' && <Summary p={p} games={games} pc={pc} cur={cur} pal={pal} compName={comp?.name} meta={meta} />}
        {tab === 'partidos' && <AllGames p={p} meta={meta} />}
        {tab === 'trayectoria' && <Career p={p} meta={meta} />}
        {tab === 'ficha' && <Bio p={p} />}
      </main>
      <Foot updated={meta.updated} />
    </div>
  )
}

function Photo({ p }: { p: PlayerRec }) {
  const [bad, setBad] = useState<string[]>([])
  const opts = [
    ['body', p.body],
    ['cut', p.cut],
    ['frame', p.photo]
  ].filter(([k, u]) => u && !bad.includes(k!)) as [string, string][]
  const [k, u] = opts[0] ?? []
  const fail = () => setBad((b) => [...b, k])
  if (!k) return <div className="silhouette">{p.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')}</div>
  if (k === 'frame')
    return (
      <div className="frame">
        <img src={src(u)} alt={p.name} onError={fail} />
      </div>
    )
  return <img className={k} src={src(u)} alt={p.name} onError={fail} />
}

type Pc = ReturnType<typeof percentiles>
const METRICS = [
  ['pts', 'Puntos'],
  ['val', 'Valoración'],
  ['reb', 'Rebotes'],
  ['ast', 'Asistencias']
] as const

function Summary({ p, games, pc, cur, pal, compName, meta }: { p: PlayerRec; games: LogRow[]; pc: Pc; cur?: Season; pal: { dk: string; lt: string }; compName?: string; meta: Meta }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number][0]>('pts')
  const chart = games.map((r) => {
    const s = line(r)
    const opp = p.tm[r[4]]
    const v = metric === 'pts' ? (s[S.pts] ?? 0) : metric === 'val' ? val(s) : metric === 'reb' ? (s[S.reb] ?? 0) : (s[S.ast] ?? 0)
    const won = r[6] > r[7]
    return { v, lab: (opp?.a ?? opp?.n ?? '').slice(0, 4).toUpperCase(), sub: won ? 'V' : 'D', title: `${dateShort(r[2])} · ${r[5] ? '' : 'en '}${opp?.n}: ${v}`, color: won ? pal.dk : `color-mix(in oklab, ${pal.dk} 32%, var(--card2))`, href: href.game(r[0]) }
  })
  const shots: [string, number, number][] = cur
    ? [
        ['Tiros de 2', cur.s[S.f2m] ?? 0, cur.s[S.f2a] ?? 0],
        ['Triples', cur.s[S.f3m] ?? 0, cur.s[S.f3a] ?? 0],
        ['Libres', cur.s[S.ftm] ?? 0, cur.s[S.fta] ?? 0]
      ]
    : []
  const records = useMemo(() => {
    const keys: [string, (s: (number | null)[]) => number][] = [
      ['Puntos', (s) => s[S.pts] ?? 0],
      ['Valoración', (s) => val(s)],
      ['Rebotes', (s) => s[S.reb] ?? 0],
      ['Asistencias', (s) => s[S.ast] ?? 0],
      ['Triples', (s) => s[S.f3m] ?? 0],
      ['Robos', (s) => s[S.stl] ?? 0]
    ]
    return keys
      .map(([k, f]) => {
        let best: LogRow | undefined
        let bv = -Infinity
        for (const r of p.log) {
          const v = f(line(r))
          if (v > bv) (bv = v), (best = r)
        }
        return best && bv > 0 ? { k, v: bv, r: best } : null
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
  }, [p.log])
  const last4 = [...games].reverse().slice(0, 4)
  return (
    <>
      <div className="grid g-12">
        <section className="card">
          <Sec aside={pc ? `percentil entre ${pc.pool} jugadores` : undefined}>Perfil</Sec>
          {pc ? (
            <>
              <Radar items={pc.items.filter((x) => x.k !== 'tov').slice(0, 8).map((x) => ({ short: x.short, pct: x.pct }))} color={pal.dk} />
              <div className="plist">
                {pc.items.map((x) => (
                  <div key={x.k}>
                    <span>{x.label}</span>
                    <b>{x.fmt(x.v)}</b>
                    <em style={{ color: pctColor(x.pct) }}>{x.pct}</em>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">Sin datos suficientes esta temporada</div>
          )}
        </section>
        <section className="card">
          <Sec aside={compName ? `${compName}${cur ? ' ' + seasonLabel(cur.y) : ''}` : undefined}>Partido a partido</Sec>
          <div className="chips" style={{ marginBottom: 14 }}>
            {METRICS.map(([k, l]) => (
              <button key={k} className={`chip ${metric === k ? 'on' : ''}`} onClick={() => setMetric(k)}>
                {l}
              </button>
            ))}
          </div>
          <BarChart data={chart} color={pal.dk} h={250} />
          {cur && (
            <div className="shots">
              {shots.map(([k, m, at]) => (
                <div className="shot" key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{at ? `${pct(m, at)}%` : '–'}</div>
                  <div className="m">
                    {m} de {at}
                  </div>
                  <div className="bar">
                    <i style={{ width: `${pct(m, at) ?? 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <Medals titles={p.titles ?? []} medals={p.medals ?? []} />
      {last4.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec more={{ to: `${href.player(p.ref)}?v=partidos`, label: 'Todos' }}>Últimos partidos</Sec>
          <div className="gcards">
            {last4.map((r) => {
              const s = line(r)
              const opp = p.tm[r[4]]
              const won = r[6] > r[7]
              const v = val(s)
              return (
                <a className="gm" key={r[0]} href={href.game(r[0])}>
                  <div className="hd">
                    <Crest url={opp?.l} name={opp?.n ?? '?'} c1={opp?.c1} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div className="op">
                        {r[5] ? '' : '@ '}
                        {opp?.s ?? opp?.n}
                      </div>
                      <div className="dt">
                        {dateShort(r[2])} · {r[6]}-{r[7]}
                      </div>
                    </div>
                  </div>
                  <span className="rs" style={{ background: won ? 'var(--win)' : 'var(--loss)' }}>
                    {won ? 'VICTORIA' : 'DERROTA'}
                  </span>
                  <div className="ln">
                    <div>
                      <b>{s[S.pts]}</b>
                      <span>PTS</span>
                    </div>
                    <div>
                      <b>{s[S.reb]}</b>
                      <span>REB</span>
                    </div>
                    <div>
                      <b>{s[S.ast]}</b>
                      <span>AST</span>
                    </div>
                    <div>
                      <b style={{ color: valColor(v) }}>{v}</b>
                      <span>VAL</span>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}
      {records.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec aside={`mejor marca en un partido · ${p.log.length} partidos en la base de datos`}>Récords</Sec>
          <div className="leaders" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {records.map((x) => {
              const opp = p.tm[x.r[4]]
              return (
                <a key={x.k} href={href.game(x.r[0])} style={{ borderLeft: '3px solid var(--c-dk)', paddingLeft: 14 }}>
                  <div style={{ font: '700 38px/1 var(--cond)' }}>{x.v}</div>
                  <div style={{ font: '600 13px var(--cond)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--tx2)' }}>{x.k}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    vs {opp?.s ?? opp?.n} · {dateYear(x.r[2])}
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}
      <CareerTable p={p} compact meta={meta} />
    </>
  )
}

/** Temporadas agrupadas por sección (liga, filial, Europa…). */
function CareerTable({ p, compact, meta }: { p: PlayerRec; compact?: boolean; meta?: Meta }) {
  const rows = p.seasons
  if (!rows.length) return null
  const ORDER: Season['sec'][] = ['liga', 'filial', 'copa', 'europa', 'seleccion', 'formacion']
  const secs = ORDER.filter((x) => rows.some((s) => s.sec === x))
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <Sec aside="medias por temporada" more={compact ? { to: `${href.player(p.ref)}?v=trayectoria`, label: 'Detalle' } : undefined}>
        Trayectoria
      </Sec>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th className="l">Temporada</th>
              <th className="l">Equipo</th>
              <th className="l hide-m">Competición</th>
              <th>PJ</th>
              <th>Min</th>
              <th>Pts</th>
              <th>Reb</th>
              <th>Ast</th>
              <th className="hide-m">T3</th>
              <th>Val</th>
            </tr>
          </thead>
          {secs.map((sec) => (
            <tbody key={sec}>
              {secs.length > 1 && (
                <tr>
                  <td colSpan={10} className="l" style={{ font: '700 13px var(--cond)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx3)', paddingTop: 18 }}>
                    {SECTION_NAME[sec]}
                  </td>
                </tr>
              )}
              {rows
                .filter((s) => s.sec === sec)
                .slice(0, compact ? 8 : undefined)
                .map((s, i) => {
                  const t = s.t != null ? p.tm[s.t] : undefined
                  const a = per(s.s, s.gp)
                  const name = t?.n ?? s.team ?? '–'
                  const club = t?.c ?? s.club
                  const compName = meta ? compOf(meta, s.code)?.name : undefined
                  return (
                    <tr key={i} className={`${s.ed != null && s.ed === p.cur?.ed ? 'cur' : ''} ${club ? 'link' : ''}`} onClick={club ? () => (location.hash = href.club(club, s.y).slice(1)) : undefined}>
                      <td className="l">{seasonLabel(s.y)}</td>
                      <td className="l">
                        <span className="who">
                          <Crest url={t?.l ?? s.logo} name={name} c1={t?.c1} size={22} />
                          {name}
                        </span>
                      </td>
                      <td className="l hide-m">
                        <span className="lgp">{compName ?? s.code.replace(/_/g, ' ')}</span>
                      </td>
                      <td>{s.gp}</td>
                      <td>{n1(a.min)}</td>
                      <td className="b">{n1(a.pts)}</td>
                      <td>{n1(a.reb)}</td>
                      <td>{n1(a.ast)}</td>
                      <td className="hide-m">{s.s[S.f3a] ? `${s.s[S.f3m]}/${s.s[S.f3a]}` : '–'}</td>
                      <td className="b">{n1(a.val)}</td>
                    </tr>
                  )
                })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}

function Career({ p, meta }: { p: PlayerRec; meta: Meta }) {
  // Totales por competición
  const byComp = new Map<string, { code: string; gp: number; s: number[]; seasons: number }>()
  for (const s of p.seasons) {
    const a = byComp.get(s.code) ?? { code: s.code, gp: 0, s: new Array(19).fill(0), seasons: 0 }
    a.gp += s.gp
    a.seasons++
    s.s.forEach((v, i) => (a.s[i] += v ?? 0))
    byComp.set(s.code, a)
  }
  return (
    <>
      <CareerTable p={p} meta={meta} />
      <div className="grid g-2">
        <section className="card">
          <Sec aside="suma de todas sus temporadas">Por competición</Sec>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th className="l">Competición</th>
                  <th>Temp.</th>
                  <th>PJ</th>
                  <th>Pts</th>
                  <th>Reb</th>
                  <th>Ast</th>
                  <th>Val</th>
                </tr>
              </thead>
              <tbody>
                {[...byComp.values()].map((c) => {
                  const a = per(c.s, c.gp)
                  return (
                    <tr key={c.code}>
                      <td className="l b">{compOf(meta, c.code)?.name ?? c.code}</td>
                      <td>{c.seasons}</td>
                      <td>{c.gp}</td>
                      <td>{n1(a.pts)}</td>
                      <td>{n1(a.reb)}</td>
                      <td>{n1(a.ast)}</td>
                      <td className="b">{n1(a.val)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        {p.stints.length > 0 && (
          <section className="card">
            <Sec aside="licencias FEB en todas las categorías">Etapas</Sec>
            <div className="tw">
              <table className="t">
                <thead>
                  <tr>
                    <th className="l">Temporada</th>
                    <th className="l">Club</th>
                    <th className="l">Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  {[...p.stints].reverse().map((s, i) => (
                    <tr key={i}>
                      <td className="l">{seasonLabel(s[0])}</td>
                      <td className="l b">{s[3] ?? s[2]}</td>
                      <td className="l">{s[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function AllGames({ p, meta }: { p: PlayerRec; meta: Meta }) {
  const eds = [...new Set(p.log.map((r) => r[1]))].reverse()
  const [edq, setEd] = useQuery('ed', String(eds[0] ?? ''))
  const edId = Number(edq)
  const rows = p.log.filter((r) => r[1] === edId)
  const label = (id: number) => {
    const s = p.seasons.find((x) => x.ed === id)
    return s ? `${seasonLabel(s.y)} · ${compOf(meta, s.code)?.name ?? s.code}` : String(id)
  }
  const cols: Col<LogRow>[] = [
    { k: 'd', label: 'Fecha', l: true, get: (r) => r[2] ?? '', fmt: (r) => dateShort(r[2]), asc: false },
    {
      k: 'opp',
      label: 'Rival',
      l: true,
      get: (r) => p.tm[r[4]]?.n ?? '',
      fmt: (r) => {
        const o = p.tm[r[4]]
        return (
          <span className="who">
            <Crest url={o?.l} name={o?.n ?? '?'} c1={o?.c1} size={22} />
            {r[5] ? '' : 'en '}
            {o?.s ?? o?.n}
          </span>
        )
      }
    },
    { k: 'res', label: 'Res.', l: true, get: (r) => r[6] - r[7], fmt: (r) => <b style={{ color: r[6] > r[7] ? 'var(--win)' : 'var(--loss)' }}>{`${r[6] > r[7] ? 'V' : 'D'} ${r[6]}-${r[7]}`}</b> },
    { k: 'min', label: 'Min', get: (r) => Math.round((line(r)[S.sec] ?? 0) / 60) },
    { k: 'pts', label: 'Pts', b: true, get: (r) => line(r)[S.pts] },
    { k: 't2', label: 'T2', hideM: true, get: (r) => line(r)[S.f2m], fmt: (r) => `${line(r)[S.f2m]}/${line(r)[S.f2a]}` },
    { k: 't3', label: 'T3', get: (r) => line(r)[S.f3m], fmt: (r) => `${line(r)[S.f3m]}/${line(r)[S.f3a]}` },
    { k: 'tl', label: 'TL', hideM: true, get: (r) => line(r)[S.ftm], fmt: (r) => `${line(r)[S.ftm]}/${line(r)[S.fta]}` },
    { k: 'reb', label: 'Reb', get: (r) => line(r)[S.reb] },
    { k: 'ast', label: 'Ast', get: (r) => line(r)[S.ast] },
    { k: 'stl', label: 'Rob', hideM: true, get: (r) => line(r)[S.stl] },
    { k: 'tov', label: 'Pér', hideM: true, get: (r) => line(r)[S.tov] },
    { k: 'val', label: 'Val', get: (r) => val(line(r)), fmt: (r) => <span className="badge" style={{ background: valColor(val(line(r))) }}>{val(line(r))}</span> }
  ]
  const tot = rows.reduce((a, r) => (line(r).forEach((v, i) => (a[i] += v ?? 0)), a), new Array(19).fill(0))
  const avg = per(tot, rows.length)
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec
        aside={
          <select className="select light" value={edq} onChange={(e) => setEd(e.target.value)}>
            {eds.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        }
      >
        Partidos
      </Sec>
      {rows.length ? (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            {rows.length} partidos · {n1(avg.pts)} puntos, {n1(avg.reb)} rebotes, {n1(avg.ast)} asistencias y {n1(avg.val)} de valoración por partido · {n0(fga(tot))} tiros de campo
          </p>
          <SortTable rows={[...rows].reverse()} cols={cols} initial="d" onRow={(r) => href.game(r[0])} />
        </>
      ) : (
        <div className="empty">Sin partidos</div>
      )}
    </section>
  )
}

function Bio({ p }: { p: PlayerRec }) {
  const rows: [string, string | null][] = [
    ['Nombre completo', p.full ?? p.name],
    ['Fecha de nacimiento', dob(p.birth)],
    ['Lugar de nacimiento', p.place],
    ['Nacionalidad', p.nat ? `${flag(p.nat)} ${p.nat}` : null],
    ['Altura', p.h ? `${height(p.h)} · ${feet(p.h)}` : null],
    ['Peso', p.w ? `${p.w} kg` : null],
    ['Posición', p.posc ? POS[p.posc] ?? p.pos : p.pos],
    ['Dorsal', p.cur?.num ?? null]
  ]
  const socials = Object.entries(p.socials ?? {})
  return (
    <div className="grid g-2">
      <section className="card info">
        <Sec>Datos personales</Sec>
        <dl>
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <FragmentRow key={k} k={k} v={v!} />
            ))}
        </dl>
      </section>
      {socials.length > 0 && (
        <section className="card info">
          <Sec>Redes sociales</Sec>
          <dl>
            {socials.map(([k, v]) => (
              <FragmentRow key={k} k={k[0].toUpperCase() + k.slice(1)} v={<a href={v} target="_blank" rel="noreferrer" style={{ color: 'var(--c-dk)' }}>{v.replace(/^https?:\/\/(www\.)?/, '')}</a>} />
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
const FragmentRow = ({ k, v }: { k: string; v: ReactNode }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
)
