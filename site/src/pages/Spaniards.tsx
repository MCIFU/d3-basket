import { useEffect, useMemo } from 'react'
import { Avatar, Court, Crest, Foot, Loading, Sec, SortTable, Strip, src, type Col } from '../components/ui'
import { cssVars, valColor } from '../lib/color'
import { EspLast } from '../components/EspLast'
import { LOG0, S, compOf, load, loadDays, useLoad, type LogRow, type Meta, type PlLite, type TL } from '../lib/data'
import { age, dateShort, n1, per, POS, seasonLabel, val } from '../lib/fmt'
import { href } from '../lib/router'

interface Row {
  p: string
  ed: number
  code: string
  t: number
  ab: number
  gp: number
  w: number
  s: number[]
  last: LogRow
}
interface Esp {
  y: number
  rows: Row[]
  teams: Record<number, TL>
  pl: Record<string, PlLite>
}
const SPAIN = { dk: '#7a0f1c', lt: '#e8b100' }

export default function Spaniards({ meta }: { meta: Meta }) {
  const d = useLoad(() => load<Esp>('espanoles.json'), [])
  useEffect(() => {
    document.title = 'Españoles por el mundo · d3 basket'
  }, [])
  if (d === undefined) return <Loading />
  if (!d || d instanceof Error) return <div className="loading">Sin datos</div>
  return <Page meta={meta} d={d} />
}

function Page({ meta, d }: { meta: Meta; d: Esp }) {
  const days = useLoad(loadDays, [])
  const dd = days && !(days instanceof Error) ? days : undefined
  // Una tarjeta por jugador: su liga como fila principal y el resto de competiciones debajo.
  const abroad = useMemo(() => {
    const by = new Map<string, Row[]>()
    for (const r of d.rows) if (r.gp > 0) by.set(r.p, [...(by.get(r.p) ?? []), r])
    return [...by.values()]
      .filter((rs) => rs.some((r) => r.ab))
      .map((rs) => {
        const sorted = [...rs].sort((a, b) => Number(compOf(meta, a.code)?.country === 'EU') - Number(compOf(meta, b.code)?.country === 'EU') || b.gp - a.gp)
        return { main: sorted[0], also: sorted.slice(1) }
      })
      .sort((a, b) => val(b.main.s) / b.main.gp - val(a.main.s) / a.main.gp)
  }, [d, meta])
  const euro = useMemo(() => d.rows.filter((r) => !r.ab && r.gp > 0), [d])
  const people = new Set(d.rows.map((r) => r.p)).size
  const comps = [...new Set(d.rows.map((r) => r.code))]
  const countries = new Set(abroad.map((x) => compOf(meta, x.main.code)?.country).filter((c) => c && c !== 'EU'))
  return (
    <div style={cssVars(SPAIN)}>
      <section className="hero short">
        <Court />
        <div className="ghost">España</div>
        <div className="wrap">
          <span className="kicker" style={{ paddingLeft: 14 }}>
            Temporada {seasonLabel(d.y)}
          </span>
          <h1>
            <small>Españoles por el</small>Mundo
          </h1>
        </div>
      </section>
      <main className="wrap page">
        <Strip
          items={[
            { k: 'Jugadores', v: String(people) },
            { k: 'En clubes extranjeros', v: String(abroad.length) },
            { k: 'Competiciones', v: String(comps.length) },
            { k: 'Países', v: String(countries.size) }
          ]}
          note={<span>Jugadores españoles con partidos esta temporada fuera de las ligas españolas: en clubes de otros países y en las competiciones europeas.</span>}
        />
        {dd && (dd.esp?.length ?? 0) > 0 && (
          <section className="card" style={{ marginTop: 26 }}>
            <Sec aside="partidos de los últimos días fuera de las ligas españolas">Últimos partidos</Sec>
            <EspLast days={dd} meta={meta} />
          </section>
        )}
        {abroad.length > 0 && (
          <section className="card" style={{ marginTop: 20 }}>
            <Sec aside="ordenados por valoración media">Fuera de España</Sec>
            <div className="abroad">
              {abroad.map(({ main, also }) => (
                <AbroadCard key={main.p} r={main} also={also} d={d} meta={meta} />
              ))}
            </div>
          </section>
        )}
        {[...new Set(euro.map((r) => r.code))].map((code) => (
          <EuroTable key={code} code={code} rows={euro.filter((r) => r.code === code)} d={d} meta={meta} />
        ))}
      </main>
      <Foot updated={meta.updated} />
    </div>
  )
}

function AbroadCard({ r, also, d, meta }: { r: Row; also: Row[]; d: Esp; meta: Meta }) {
  const pl = d.pl[r.p]
  const t = d.teams[r.t]
  const c = compOf(meta, r.code)
  const a = per(r.s, r.gp)
  const l = r.last.slice(LOG0) as (number | null)[]
  const opp = d.teams[r.last[4]]
  const won = r.last[6] > r.last[7]
  return (
    <a className="ab" href={href.player(r.p)}>
      <div className="ab-top">
        <Avatar url={pl?.[1]} name={pl?.[0] ?? '?'} size={68} />
        <div style={{ minWidth: 0 }}>
          <div className="nm">{pl?.[0]}</div>
          <div className="tm">
            <Crest url={t?.l} name={t?.n ?? ''} c1={t?.c1} size={18} />
            {t?.n}
          </div>
          <div className="cp">
            {c?.logo && <img src={src(c.logo)} alt="" />}
            {c?.name}
            {pl?.[3] ? ` · ${POS[pl[3]] ?? ''}` : ''}
            {pl?.[5] ? ` · ${age(pl[5])} años` : ''}
          </div>
        </div>
      </div>
      <div className="ab-nums">
        {(
          [
            ['Pts', a.pts],
            ['Reb', a.reb],
            ['Ast', a.ast],
            ['Val', a.val]
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <b>{n1(v)}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>
      {also.length > 0 && (
        <div className="ab-also">
          {also.map((o) => {
            const oc = compOf(meta, o.code)
            const x = per(o.s, o.gp)
            return (
              <span key={o.code}>
                {oc?.logo && <img src={src(oc.logo)} alt="" />}
                {oc?.name}: {o.gp} PJ · {n1(x.pts)} pts · {n1(x.val)} val
              </span>
            )
          })}
        </div>
      )}
      <div className="ab-last">
        <span>
          Último: {r.last[5] ? 'vs' : 'en'} {opp?.s ?? opp?.n} · {dateShort(r.last[2])}
        </span>
        <span>
          <b style={{ color: won ? 'var(--win)' : 'var(--loss)' }}>{won ? 'V' : 'D'}</b> · {l[S.pts]} pts · <span className="badge" style={{ background: valColor(val(l)), height: 20, minWidth: 26, fontSize: 13 }}>{val(l)}</span>
        </span>
      </div>
    </a>
  )
}

function EuroTable({ code, rows, d, meta }: { code: string; rows: Row[]; d: Esp; meta: Meta }) {
  const c = compOf(meta, code)
  const cols: Col<Row>[] = [
    {
      k: 'n',
      label: 'Jugador',
      l: true,
      asc: true,
      get: (r) => d.pl[r.p]?.[0] ?? '',
      fmt: (r) => (
        <span className="who">
          <Avatar url={d.pl[r.p]?.[1]} name={d.pl[r.p]?.[0] ?? '?'} size={32} />
          <span>
            {d.pl[r.p]?.[0]}
            <small style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crest url={d.teams[r.t]?.l} name={d.teams[r.t]?.n ?? ''} c1={d.teams[r.t]?.c1} size={14} />
              {d.teams[r.t]?.s ?? d.teams[r.t]?.n}
            </small>
          </span>
        </span>
      )
    },
    { k: 'gp', label: 'PJ', get: (r) => r.gp },
    { k: 'min', label: 'Min', get: (r) => per(r.s, r.gp).min, fmt: (r) => n1(per(r.s, r.gp).min) },
    { k: 'pts', label: 'Pts', b: true, get: (r) => per(r.s, r.gp).pts, fmt: (r) => n1(per(r.s, r.gp).pts) },
    { k: 'reb', label: 'Reb', get: (r) => per(r.s, r.gp).reb, fmt: (r) => n1(per(r.s, r.gp).reb) },
    { k: 'ast', label: 'Ast', get: (r) => per(r.s, r.gp).ast, fmt: (r) => n1(per(r.s, r.gp).ast) },
    { k: 'val', label: 'Val', b: true, get: (r) => per(r.s, r.gp).val, fmt: (r) => n1(per(r.s, r.gp).val) }
  ]
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <Sec aside={`${rows.length} jugadores en clubes españoles`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {c?.logo && <img src={src(c.logo)} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />}
          {c?.name ?? code}
        </span>
      </Sec>
      <SortTable rows={rows} cols={cols} initial="val" onRow={(r) => href.player(r.p)} />
    </section>
  )
}
