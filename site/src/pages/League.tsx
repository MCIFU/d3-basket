import { useEffect, useMemo, type CSSProperties } from 'react'
import { Avatar, Crest, Foot, Loading, NotFound, Score, Sec, SortTable, Strip, Tabs, src, type Col, Court } from '../components/ui'
import { cssVars, palette } from '../lib/color'
import { S, compOf, loadEd, useLoad, type Comp, type EdFile, type Meta, type Stand, type TeamE, type Zone } from '../lib/data'
import { n1, per, POS_SHORT, ts, val } from '../lib/fmt'
import { href, useQuery } from '../lib/router'
import { Bracket, Evolution, Records, hasEvolution, hasKnockout } from './LeagueExtra'
import { currentRound, minGames, players, roundKey, roundName, teams as teamAggs, type PAgg } from '../lib/stats'

export default function League({ meta, code, year }: { meta: Meta; code: string; year?: number }) {
  const comp = compOf(meta, code)
  const edRef = comp ? (year ? comp.eds.find((e) => e.y === year) : comp.eds[0]) : undefined
  const ed = useLoad(() => (edRef ? loadEd(edRef.id) : Promise.resolve(undefined)), [edRef?.id])
  useEffect(() => {
    if (comp) document.title = `${comp.name} · d3 basket`
  }, [comp])
  if (!comp || !edRef) return <NotFound what="Competición" />
  if (ed === undefined) return <Loading />
  if (!ed || ed instanceof Error) return <NotFound what="Temporada" />
  return <LeaguePage meta={meta} comp={comp} ed={ed} key={ed.id} />
}

const ZONE_COLOR: Record<Zone['kind'], string> = { up: 'var(--up)', playoff: 'var(--playoff)', down: 'var(--down)' }
const zoneOf = (zones: Zone[], pos: number, n: number) => zones.find((z) => {
  const from = z.from < 0 ? n + z.from + 1 : z.from
  const to = z.to < 0 ? n + z.to + 1 : z.to
  return pos >= from && pos <= to
})

function LeaguePage({ meta, comp, ed }: { meta: Meta; comp: Comp; ed: EdFile }) {
  const [tab, setTab] = useQuery('v', 'clasificacion')
  const pal2 = { dk: palette(comp.color).dk, lt: comp.color ?? comp.color2 ?? '#2f7be0' }
  const tm = useMemo(() => new Map(ed.teams.map((t) => [t.id, t])), [ed])
  const fin = ed.games.filter((g) => g.st === 'f' && g.hs != null)
  const ppg = fin.length ? fin.reduce((s, g) => s + g.hs! + g.as!, 0) / (fin.length * 2) : null
  const rounds = new Set(fin.filter((g) => g.ph === 'regular').map((g) => g.r)).size
  const leader = ed.stand.find((s) => s.pos === 1 && !s.g) ?? ed.stand.find((s) => s.pos === 1)
  const lt = leader ? tm.get(leader.t) : undefined
  return (
    <div style={cssVars(pal2)}>
      <section className="hero">
        <Court />
        <div className="ghost">{(comp.short ?? comp.name).split(' ')[0]}</div>
        <div className="wrap hc">
          {comp.logo ? <img className="bigcrest" src={src(comp.logo)} alt="" /> : <div className="bigcrest ph">{comp.name.slice(0, 3)}</div>}
          <div>
            <select className="select" value={ed.y} onChange={(e) => (location.hash = href.comp(comp.code, Number(e.target.value)).slice(1))} aria-label="Temporada">
              {comp.eds.map((e) => (
                <option key={e.id} value={e.y}>
                  Temporada {e.label}
                </option>
              ))}
            </select>
            <h1 className={comp.name.length > 18 ? 'sm' : comp.name.length > 12 ? 'mid' : ''}>{comp.name}</h1>
            <dl className="meta">
              {comp.division && (
                <div>
                  <dt>Categoría</dt>
                  <dd>{comp.division}</dd>
                </div>
              )}
              <div>
                <dt>Equipos</dt>
                <dd>{ed.teams.length}</dd>
              </div>
              <div>
                <dt>Partidos</dt>
                <dd>
                  {fin.length} / {ed.games.length}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
      <main className="wrap page">
        <Strip
          items={[
            { k: 'Equipos', v: String(ed.teams.length) },
            { k: comp.code === 'NBA' || comp.code === 'NCAA' ? 'Semanas jugadas' : 'Jornadas jugadas', v: String(rounds) },
            { k: 'Partidos jugados', v: String(fin.length), bar: ed.games.length ? (100 * fin.length) / ed.games.length : 0 },
            { k: 'Puntos por equipo', v: n1(ppg) }
          ]}
          note={
            lt && leader ? (
              <a href={href.club(lt.club, ed.y)} style={{ display: 'grid', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Crest url={lt.logo} name={lt.name} c1={lt.c1} size={34} />
                  <b>{lt.short ?? lt.name}</b>
                </span>
                <span>
                  Líder{leader.g ? ` del grupo ${leader.g}` : ''} · {leader.w}-{leader.l}
                </span>
              </a>
            ) : (
              <span>Temporada {ed.label}</span>
            )
          }
        />
        <Tabs
          value={tab as 'clasificacion'}
          set={setTab}
          items={
            [
              ['clasificacion', 'Clasificación'],
              ...(hasEvolution(ed) ? [['evolucion', 'Evolución']] : []),
              ...(hasKnockout(ed) ? [['eliminatorias', 'Eliminatorias']] : []),
              ['partidos', 'Partidos'],
              ['estadisticas', 'Estadísticas'],
              ['records', 'Récords'],
              ['equipos', 'Equipos']
            ] as ['clasificacion', string][]
          }
        />
        {tab === 'clasificacion' && <Standings comp={comp} ed={ed} tm={tm} />}
        {tab === 'partidos' && <Rounds ed={ed} tm={tm} />}
        {tab === 'estadisticas' && <Stats ed={ed} tm={tm} />}
        {tab === 'equipos' && <Teams ed={ed} />}
        {tab === 'evolucion' && <Evolution ed={ed} tm={tm} />}
        {tab === 'eliminatorias' && <Bracket ed={ed} tm={tm} />}
        {tab === 'records' && <Records ed={ed} tm={tm} />}
      </main>
      <Foot updated={ed.last ?? meta.updated} />
    </div>
  )
}

function Standings({ comp, ed, tm }: { comp: Comp; ed: EdFile; tm: Map<number, TeamE> }) {
  const groups = [...new Set(ed.stand.map((s) => s.g ?? ''))].sort()
  const aggs = useMemo(() => teamAggs(ed), [ed])
  const single = groups.length === 1
  if (!ed.stand.length) return <div className="card empty" style={{ marginTop: 22 }}>Sin clasificación</div>
  return (
    <div className={`grid ${groups.length > 1 ? 'g-2' : ''}`}>
      {groups.map((g) => {
        const rows = ed.stand.filter((s) => (s.g ?? '') === g).sort((a, b) => a.pos - b.pos)
        return (
          <section className="card" key={g}>
            <Sec aside={single ? `${rows[0]?.pj ? `tras ${Math.max(...rows.map((r) => r.pj))} jornadas` : ''}` : undefined}>{g ? `${comp.code === 'NBA' ? 'Conferencia' : 'Grupo'} ${g}` : 'Clasificación'}</Sec>
            <div className="tw">
              <table className="t">
                <thead>
                  <tr>
                    <th className="l">#</th>
                    <th className="l">Equipo</th>
                    <th>PJ</th>
                    <th>G</th>
                    <th>P</th>
                    <th className="hide-m">PF</th>
                    <th className="hide-m">PC</th>
                    <th>Dif</th>
                    {groups.length === 1 && <th className="hide-m">Casa</th>}
                    {groups.length === 1 && <th className="hide-m">Fuera</th>}
                    <th className="l hide-m">Racha</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s: Stand) => {
                    const t = tm.get(s.t)
                    const z = single ? zoneOf(comp.zones, s.pos, rows.length) : undefined
                    const a = aggs.get(s.t)
                    return (
                      <tr key={s.t} className={`link ${z ? 'zone' : ''}`} style={z ? ({ '--z': ZONE_COLOR[z.kind] } as CSSProperties) : undefined} onClick={() => t && (location.hash = href.club(t.club, ed.y).slice(1))}>
                        <td className="l">
                          <span className="pos">{s.pos}</span>
                        </td>
                        <td className="l">
                          <span className="who">
                            <Crest url={t?.logo} name={t?.name ?? '?'} c1={t?.c1} size={26} />
                            <span className="hide-m">{t?.name}</span>
                            <span className="show-m nm-cut">{t?.short ?? t?.name}</span>
                          </span>
                        </td>
                        <td>{s.pj}</td>
                        <td className="b">{s.w}</td>
                        <td>{s.l}</td>
                        <td className="hide-m">{s.pf}</td>
                        <td className="hide-m">{s.pa}</td>
                        <td style={{ color: s.pf - s.pa > 0 ? 'var(--win)' : s.pf - s.pa < 0 ? 'var(--loss)' : undefined, fontWeight: 600 }}>{s.pf - s.pa > 0 ? '+' : ''}{s.pf - s.pa}</td>
                        {groups.length === 1 && <td className="hide-m">{a ? `${a.hw}-${a.hl}` : ''}</td>}
                        {groups.length === 1 && <td className="hide-m">{a ? `${a.aw}-${a.al}` : ''}</td>}
                        <td className="l hide-m">
                          <span className="form">
                            {[...s.form].map((c, i) => (
                              <i key={i} className={c}>
                                {c === 'W' ? 'V' : 'D'}
                              </i>
                            ))}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {single && comp.zones.length > 0 && (
              <div className="chips" style={{ marginTop: 16, gap: 18 }}>
                {comp.zones.map((z) => (
                  <span key={z.label} className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: ZONE_COLOR[z.kind] }} />
                    {z.label}
                  </span>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Rounds({ ed, tm }: { ed: EdFile; tm: Map<number, TeamE> }) {
  const keys = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of ed.games) if (!m.has(roundKey(g))) m.set(roundKey(g), roundName(g))
    return [...m.entries()]
  }, [ed])
  const [rk, setRk] = useQuery('j', currentRound(ed.games))
  const list = ed.games.filter((g) => roundKey(g) === rk)
  const idx = keys.findIndex(([k]) => k === rk)
  const groups = [...new Set(list.map((g) => tm.get(g.h)?.g ?? ''))].sort()
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec
        aside={
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="chip" disabled={idx <= 0} onClick={() => setRk(keys[idx - 1][0])} aria-label="Jornada anterior">
              ←
            </button>
            <select className="select light" value={rk} onChange={(e) => setRk(e.target.value)}>
              {keys.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
            <button className="chip" disabled={idx >= keys.length - 1} onClick={() => setRk(keys[idx + 1][0])} aria-label="Jornada siguiente">
              →
            </button>
          </span>
        }
      >
        {keys[idx]?.[1] ?? 'Partidos'}
      </Sec>
      {groups.map((g) => (
        <div key={g} className="comp-block">
          {groups.length > 1 && (
            <div className="comp-head">
              <b style={{ fontSize: 16 }}>Grupo {g}</b>
            </div>
          )}
          <div className="games">
            {list
              .filter((x) => (tm.get(x.h)?.g ?? '') === g)
              .map((x) => {
                const h = tm.get(x.h)
                const a = tm.get(x.a)
                return <Score key={x.id} id={x.id} d={x.d} st={x.st} h={x.h} a={x.a} hs={x.hs} as={x.as} hn={h?.short ?? h?.name ?? '?'} an={a?.short ?? a?.name ?? '?'} hl={h?.logo ?? null} al={a?.logo ?? null} hc1={h?.c1} ac1={a?.c1} />
              })}
          </div>
        </div>
      ))}
      {!list.length && <div className="empty">Sin partidos</div>}
    </section>
  )
}

const LEAD: [string, string, (a: PAgg) => number][] = [
  ['pts', 'Puntos', (a) => a.s[S.pts] / a.gp],
  ['reb', 'Rebotes', (a) => a.s[S.reb] / a.gp],
  ['ast', 'Asistencias', (a) => a.s[S.ast] / a.gp],
  ['val', 'Valoración', (a) => val(a.s) / a.gp]
]

function Stats({ ed, tm }: { ed: EdFile; tm: Map<number, TeamE> }) {
  const rows = useMemo(() => players(ed), [ed])
  const minG = minGames(rows)
  const qual = rows.filter((r) => r.gp >= minG)
  const pl = (r: PAgg) => ed.pl[r.p]
  const cols: Col<PAgg>[] = [
    {
      k: 'name',
      label: 'Jugador',
      l: true,
      asc: true,
      get: (r) => pl(r)?.[0] ?? '',
      fmt: (r) => {
        const t = tm.get(r.t)
        return (
          <span className="who">
            <Avatar url={pl(r)?.[1]} name={pl(r)?.[0] ?? '?'} size={32} />
            <span>
              {pl(r)?.[0]}
              <small>
                {t?.short ?? t?.name}
                {pl(r)?.[3] ? ` · ${POS_SHORT[pl(r)![3]!] ?? ''}` : ''}
              </small>
            </span>
          </span>
        )
      }
    },
    { k: 'gp', label: 'PJ', get: (r) => r.gp },
    { k: 'min', label: 'Min', get: (r) => per(r.s, r.gp).min, fmt: (r) => n1(per(r.s, r.gp).min) },
    { k: 'pts', label: 'Pts', b: true, get: (r) => per(r.s, r.gp).pts, fmt: (r) => n1(per(r.s, r.gp).pts) },
    { k: 'reb', label: 'Reb', get: (r) => per(r.s, r.gp).reb, fmt: (r) => n1(per(r.s, r.gp).reb) },
    { k: 'ast', label: 'Ast', get: (r) => per(r.s, r.gp).ast, fmt: (r) => n1(per(r.s, r.gp).ast) },
    { k: 'stl', label: 'Rob', hideM: true, get: (r) => per(r.s, r.gp).stl, fmt: (r) => n1(per(r.s, r.gp).stl) },
    { k: 'blk', label: 'Tap', hideM: true, get: (r) => per(r.s, r.gp).blk, fmt: (r) => n1(per(r.s, r.gp).blk) },
    { k: 'p3', label: 'T3 %', hideM: true, get: (r) => (r.s[S.f3a] >= 10 ? r.s[S.f3m] / r.s[S.f3a] : null), fmt: (r) => (r.s[S.f3a] ? `${n1((100 * r.s[S.f3m]) / r.s[S.f3a])}` : '–') },
    { k: 'ts', label: 'TS %', hideM: true, get: (r) => ts(r.s), fmt: (r) => n1((ts(r.s) ?? 0) * 100) },
    { k: 'val', label: 'Val', b: true, get: (r) => per(r.s, r.gp).val, fmt: (r) => n1(per(r.s, r.gp).val) }
  ]
  return (
    <>
      <section className="card" style={{ marginTop: 22 }}>
        <Sec aside={`medias por partido · mínimo ${minG} partidos`}>Líderes</Sec>
        <div className="leaders">
          {LEAD.map(([k, label, f]) => {
            const top = [...qual].sort((a, b) => f(b) - f(a)).slice(0, 6)
            const [first, ...rest] = top
            if (!first) return null
            const t1 = tm.get(first.t)
            return (
              <div className="ldr" key={k}>
                <h3>{label}</h3>
                <a className="first" href={href.player(first.p)}>
                  <Avatar url={pl(first)?.[1]} name={pl(first)?.[0] ?? '?'} size={52} />
                  <span className="nm">
                    {pl(first)?.[0]}
                    <small>{t1?.short ?? t1?.name}</small>
                  </span>
                  <span className="v">{n1(f(first))}</span>
                </a>
                {rest.map((r, i) => {
                  const t = tm.get(r.t)
                  return (
                    <a className="row" key={r.p} href={href.player(r.p)}>
                      <i>{i + 2}</i>
                      <Crest url={t?.logo} name={t?.name ?? ''} c1={t?.c1} size={20} />
                      <span>{pl(r)?.[0]}</span>
                      <b>{n1(f(r))}</b>
                    </a>
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>
      <section className="card" style={{ marginTop: 20 }}>
        <Sec aside={`${rows.length} jugadores · pulsa una columna para ordenar`}>Todos los jugadores</Sec>
        <SortTable rows={qual} cols={cols} initial="val" onRow={(r) => href.player(r.p)} limit={50} />
      </section>
    </>
  )
}

function Teams({ ed }: { ed: EdFile }) {
  const aggs = useMemo(() => teamAggs(ed), [ed])
  const sorted = [...ed.teams].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec aside={`${ed.teams.length} equipos`}>Equipos</Sec>
      <div className="comps">
        {sorted.map((t) => {
          const a = aggs.get(t.id)
          const p = palette(t.c1, t.c2)
          return (
            <a key={t.id} className="cc" href={href.club(t.club, ed.y)} style={{ ['--lc' as string]: p.dk }}>
              <Crest url={t.logo} name={t.name} c1={t.c1} size={44} />
              <div>
                <b>{t.short ?? t.name}</b>
                <span>
                  {a?.gp ? `${a.w}-${a.l}` : 'Sin partidos'}
                  {t.g ? ` · Grupo ${t.g}` : ''}
                </span>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}
