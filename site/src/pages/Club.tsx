import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Avatar, Crest, Foot, Loading, NotFound, Score, Sec, SortTable, Strip, Tabs, src, type Col, Court, FavButton, Flag, ShareButton } from '../components/ui'
import { cssVars, palette } from '../lib/color'
import { S, compOf, loadClub, loadEd, useLoad, type ClubRec, type EdFile, type Meta, type RosterRow } from '../lib/data'
import { age, height, n1, per, POS, seasonLabel, ts } from '../lib/fmt'
import { href, useQuery } from '../lib/router'
import { players, teams as teamAggs, type PAgg } from '../lib/stats'

const ROLE: Record<string, string> = { head_coach: 'Primer entrenador', assistant_coach: 'Entrenador ayudante', coach: 'Entrenador', delegate: 'Delegado', physio: 'Fisioterapeuta', doctor: 'Médico' }
const SECONDARY = ['EUROLEAGUE', 'EUROCUP', 'BCL', 'COPA_ESPANA']

export default function Club({ meta, refId, year }: { meta: Meta; refId: string; year?: number }) {
  const c = useLoad(() => loadClub(refId), [refId])
  if (c === undefined) return <Loading />
  if (!c || c instanceof Error) return <NotFound what="Club" />
  return <ClubLoader meta={meta} c={c} year={year} key={c.ref + (year ?? '')} />
}

function ClubLoader({ meta, c, year }: { meta: Meta; c: ClubRec; year?: number }) {
  const y = year ?? c.teams[0]?.y
  const sameYear = c.teams.filter((t) => t.y === y)
  // Equipo principal del año: la liga nacional antes que Europa o la Copa.
  const main = [...sameYear].sort((a, b) => Number(SECONDARY.includes(a.code)) - Number(SECONDARY.includes(b.code)))[0]
  const ed = useLoad(() => (main ? loadEd(main.ed) : Promise.resolve(undefined)), [main?.ed])
  useEffect(() => {
    document.title = `${c.name} · d3 basket`
  }, [c.name])
  if (main && ed === undefined) return <Loading />
  return <ClubPage meta={meta} c={c} y={y} main={main} other={sameYear.filter((t) => t !== main)} ed={ed && !(ed instanceof Error) ? ed : undefined} />
}

function ClubPage({ meta, c, y, main, other, ed }: { meta: Meta; c: ClubRec; y?: number; main?: ClubRec['teams'][number]; other: ClubRec['teams']; ed?: EdFile }) {
  const [tab, setTab] = useQuery('v', 'plantilla')
  const comp = main ? compOf(meta, main.code) : undefined
  const pal = palette(c.c1, c.c2, comp?.color ?? undefined)
  const agg = useMemo(() => (ed && main ? teamAggs(ed).get(main.t) : undefined), [ed, main])
  const stand = ed && main ? ed.stand.find((s) => s.t === main.t) : undefined
  const groupSize = ed && stand ? ed.stand.filter((s) => s.g === stand.g).length : 0
  const years = [...new Set(c.teams.map((t) => t.y))]
  const name = c.name
  return (
    <div style={cssVars(pal)}>
      <section className="hero">
        <Court />
        <div className="ghost">{(c.short ?? c.name).split(' ')[0]}</div>
        <div className="wrap hc">
          <Crest url={c.logo ?? main?.logo} name={name} c1={c.c1} size={168} className="bigcrest" />
          <div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {comp && y && (
                <a className="kicker" href={href.comp(comp.code, y)}>
                  {comp.logo && <img className="lg" src={src(comp.logo)} alt="" />}
                  {comp.name}
                </a>
              )}
              {years.length > 0 && (
                <select className="select" value={y} onChange={(e) => (location.hash = href.club(c.ref, Number(e.target.value)).slice(1))} aria-label="Temporada">
                  {years.map((yy) => (
                    <option key={yy} value={yy}>
                      {seasonLabel(yy)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <h1 className={name.length > 22 ? 'sm' : name.length > 14 ? 'mid' : ''}>{main?.name ?? name}</h1>
            <dl className="meta">
              {c.city && (
                <div>
                  <dt>Ciudad</dt>
                  <dd>{c.city}</dd>
                </div>
              )}
              {c.founded && (
                <div>
                  <dt>Fundación</dt>
                  <dd>{c.founded}</dd>
                </div>
              )}
              {c.arena && (
                <div>
                  <dt>Pabellón</dt>
                  <dd>{c.arena}</dd>
                </div>
              )}
              {c.arenaCap && (
                <div>
                  <dt>Aforo</dt>
                  <dd>{c.arenaCap.toLocaleString('es-ES')}</dd>
                </div>
              )}
            </dl>
            <div className="hero-actions">
              <FavButton fav={{ kind: 'c', ref: c.ref, name: c.name, img: c.logo ?? main?.logo ?? null }} />
              <ShareButton />
            </div>
          </div>
        </div>
      </section>
      <main className="wrap page">
        {agg && agg.gp ? (
          <Strip
            items={[
              ...(stand ? [{ k: stand.g ? `Puesto grupo ${stand.g}` : 'Puesto', v: `${stand.pos}.º`, bar: groupSize ? (100 * (groupSize - stand.pos + 1)) / groupSize : undefined, rank: `de ${groupSize} equipos` }] : []),
              { k: 'Balance', v: `${agg.w}-${agg.l}`, bar: (100 * agg.w) / agg.gp },
              { k: 'Puntos a favor', v: n1(agg.pf / agg.gp), rank: 'por partido' },
              { k: 'Puntos en contra', v: n1(agg.pa / agg.gp), rank: 'por partido' }
            ]}
            note={
              <>
                <b style={{ color: agg.pf >= agg.pa ? 'var(--win)' : 'var(--loss)' }}>
                  {agg.pf - agg.pa > 0 ? '+' : ''}
                  {n1((agg.pf - agg.pa) / agg.gp)}
                </b>
                <span>
                  diferencia por partido · en casa {agg.hw}-{agg.hl}, fuera {agg.aw}-{agg.al}
                </span>
              </>
            }
          />
        ) : (
          <Strip items={[]} note={<span>{main ? `Temporada ${seasonLabel(main.y)} sin partidos jugados` : 'Sin temporadas en la base de datos'}</span>} />
        )}
        <Tabs
          value={tab as 'plantilla'}
          set={setTab}
          items={[
            ['plantilla', 'Plantilla'],
            ['partidos', 'Partidos'],
            ['estadisticas', 'Estadísticas'],
            ['club', 'Club']
          ]}
        />
        {tab === 'plantilla' && main && <Roster c={c} t={main.t} ed={ed} />}
        {tab === 'partidos' && main && ed && <Games ed={ed} t={main.t} other={other} meta={meta} />}
        {tab === 'estadisticas' && main && ed && <TeamStats ed={ed} t={main.t} />}
        {tab === 'club' && <Info c={c} meta={meta} />}
      </main>
      <Foot updated={ed?.last ?? meta.updated} />
    </div>
  )
}

interface CardData {
  ref: string
  num: string | null
  name: string
  photo: string | null
  cut: string | null
  posc: string | null
  nat: string | null
  birth: string | null
  h: number | null
  a?: PAgg
  active: number
}

function Card({ x }: { x: CardData }) {
  const [bad, setBad] = useState(false)
  const img = !bad ? (x.cut ?? x.photo) : null
  const parts = x.name.split(' ')
  return (
    <a className="pc" href={href.player(x.ref)}>
      <div className="ph">
        {img ? <img className={x.cut ? 'cut' : ''} src={src(img)} alt="" loading="lazy" onError={() => setBad(true)} /> : <span className="ini">{parts.slice(0, 2).map((w) => w[0]).join('')}</span>}
        {x.num && <span className="n">{x.num}</span>}
      </div>
      <div className="in">
        <div className="nm">
          <small>{parts.slice(0, -1).join(' ')}</small>
          {parts.at(-1)}
        </div>
        <div className="sub">
          <span>
            {[x.posc ? POS[x.posc] : null, age(x.birth) ? `${age(x.birth)} años` : null, height(x.h)].filter(Boolean).join(' · ')} <Flag nat={x.nat} />
          </span>
        </div>
        {x.a && x.a.gp > 0 && (
          <div className="sub" style={{ marginTop: 6 }}>
            <span>
              <b>{n1(per(x.a.s, x.a.gp).pts)}</b> pts
            </span>
            <span>
              <b>{n1(per(x.a.s, x.a.gp).reb)}</b> reb
            </span>
            <span>
              <b>{n1(per(x.a.s, x.a.gp).val)}</b> val
            </span>
          </div>
        )}
      </div>
    </a>
  )
}

function Roster({ c, t, ed }: { c: ClubRec; t: number; ed?: EdFile }) {
  const rows = c.rosters[t] ?? []
  const stats = useMemo(() => new Map((ed ? players(ed, t) : []).map((a) => [a.p, a])), [ed, t])
  // Jugadores con partidos pero sin ficha de plantilla (fuentes sin plantilla oficial).
  const extra = [...stats.values()].filter((a) => !rows.some((r) => r[0] === a.p))
  const cards: CardData[] = [
    ...rows.map((r: RosterRow) => ({ ref: r[0], num: r[1], name: r[5], photo: r[6], cut: r[7], posc: r[2] ?? r[8], nat: r[9], birth: r[10], h: r[11], a: stats.get(r[0]), active: r[3] })),
    ...extra.map((a) => {
      const pl = ed!.pl[a.p]
      return { ref: a.p, num: null, name: pl?.[0] ?? '?', photo: pl?.[1] ?? null, cut: pl?.[2] ?? null, posc: pl?.[3] ?? null, nat: pl?.[4] ?? null, birth: pl?.[5] ?? null, h: pl?.[6] ?? null, a, active: 1 }
    })
  ]
  const active = cards.filter((x) => x.active)
  const gone = cards.filter((x) => !x.active)
  const staff = c.staff[t] ?? []
  return (
    <>
      <section className="card" style={{ marginTop: 22 }}>
        <Sec aside={`${active.length} jugadores`}>Plantilla</Sec>
        {active.length ? (
          <div className="roster">
            {active.map((x) => (
              <Card key={x.ref} x={x} />
            ))}
          </div>
        ) : (
          <div className="empty">Sin plantilla en la base de datos</div>
        )}
      </section>
      {(staff.length > 0 || gone.length > 0) && (
        <div className="grid g-2">
          {staff.length > 0 && (
            <section className="card">
              <Sec>Cuerpo técnico</Sec>
              {staff.map(([n, role, ph]) => (
                <div key={n + role} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <Avatar url={ph} name={n} size={40} />
                  <div>
                    <b>{n}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {ROLE[role] ?? role}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
          {gone.length > 0 && (
            <section className="card">
              <Sec aside="pasaron por el equipo esta temporada">Bajas</Sec>
              {gone.map((x) => (
                <a key={x.ref} href={href.player(x.ref)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <Avatar url={x.photo} name={x.name} size={36} />
                  <b>{x.name}</b>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
                    {x.a?.gp ? `${x.a.gp} partidos` : ''}
                  </span>
                </a>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  )
}

function Games({ ed, t, other, meta }: { ed: EdFile; t: number; other: ClubRec['teams']; meta: Meta }) {
  const tm = new Map(ed.teams.map((x) => [x.id, x]))
  const list = ed.games.filter((g) => g.h === t || g.a === t)
  const fin = list.filter((g) => g.st === 'f')
  const next = list.filter((g) => g.st !== 'f')
  const render = (gs: typeof list) => (
    <div className="games">
      {gs.map((x) => {
        const h = tm.get(x.h)
        const a = tm.get(x.a)
        return <Score key={x.id} id={x.id} d={x.d} st={x.st} h={x.h} a={x.a} hs={x.hs} as={x.as} hn={h?.short ?? h?.name ?? '?'} an={a?.short ?? a?.name ?? '?'} hl={h?.logo ?? null} al={a?.logo ?? null} hc1={h?.c1} ac1={a?.c1} extra={x.rn ?? (x.r ? `Jornada ${x.r}` : undefined)} />
      })}
    </div>
  )
  return (
    <>
      {next.length > 0 && (
        <section className="card" style={{ marginTop: 22 }}>
          <Sec aside={`${next.length} por jugar`}>Próximos partidos</Sec>
          {render(next.slice(0, 6))}
        </section>
      )}
      <section className="card" style={{ marginTop: next.length ? 20 : 22 }}>
        <Sec aside={`${fin.length} jugados`}>Resultados</Sec>
        {fin.length ? render([...fin].reverse()) : <div className="empty">Aún no ha jugado</div>}
      </section>
      {other.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec>Otras competiciones esta temporada</Sec>
          <div className="comps">
            {other.map((o) => {
              const cp = compOf(meta, o.code)
              return (
                <a key={o.t} className="cc" href={href.comp(o.code, o.y)} style={{ ['--lc' as string]: cp?.color ?? 'var(--accent)' }}>
                  {cp?.logo ? <img src={src(cp.logo)} alt="" /> : <Crest name={o.code} size={44} />}
                  <div>
                    <b>{cp?.name ?? o.code}</b>
                    <span>{o.name}</span>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

function TeamStats({ ed, t }: { ed: EdFile; t: number }) {
  const rows = useMemo(() => players(ed, t), [ed, t])
  const pl = (r: PAgg) => ed.pl[r.p]
  const f = (k: keyof ReturnType<typeof per>) => (r: PAgg) => per(r.s, r.gp)[k]
  const cols: Col<PAgg>[] = [
    {
      k: 'name',
      label: 'Jugador',
      l: true,
      asc: true,
      get: (r) => pl(r)?.[0] ?? '',
      fmt: (r) => (
        <span className="who">
          <Avatar url={pl(r)?.[1]} name={pl(r)?.[0] ?? '?'} size={32} />
          {pl(r)?.[0]}
        </span>
      )
    },
    { k: 'gp', label: 'PJ', get: (r) => r.gp },
    { k: 'gs', label: 'Tit', hideM: true, get: (r) => r.gs },
    { k: 'min', label: 'Min', get: f('min'), fmt: (r) => n1(f('min')(r)) },
    { k: 'pts', label: 'Pts', b: true, get: f('pts'), fmt: (r) => n1(f('pts')(r)) },
    { k: 'reb', label: 'Reb', get: f('reb'), fmt: (r) => n1(f('reb')(r)) },
    { k: 'ast', label: 'Ast', get: f('ast'), fmt: (r) => n1(f('ast')(r)) },
    { k: 'stl', label: 'Rob', hideM: true, get: f('stl'), fmt: (r) => n1(f('stl')(r)) },
    { k: 't3', label: 'T3', hideM: true, get: (r) => r.s[S.f3m], fmt: (r) => `${r.s[S.f3m]}/${r.s[S.f3a]}` },
    { k: 'ts', label: 'TS %', hideM: true, get: (r) => ts(r.s), fmt: (r) => n1((ts(r.s) ?? 0) * 100) },
    { k: 'val', label: 'Val', b: true, get: f('val'), fmt: (r) => n1(f('val')(r)) }
  ]
  if (!rows.length) return <div className="card empty" style={{ marginTop: 22 }}>Sin estadísticas esta temporada</div>
  return (
    <section className="card" style={{ marginTop: 22 }}>
      <Sec aside="medias por partido">Estadísticas</Sec>
      <SortTable rows={rows} cols={cols} initial="val" onRow={(r) => href.player(r.p)} />
    </section>
  )
}

function Info({ c, meta }: { c: ClubRec; meta: Meta }) {
  const rows: [string, ReactNode][] = [
    ['Nombre', c.name],
    ['Ciudad', c.city],
    ['Fundación', c.founded],
    ['Pabellón', c.arena],
    ['Aforo', c.arenaCap?.toLocaleString('es-ES')],
    ['Presidente', c.president],
    ['Web', c.web ? <a href={c.web} target="_blank" rel="noreferrer" style={{ color: 'var(--c-dk)' }}>{c.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a> : null]
  ].filter(([, v]) => v != null && v !== '') as [string, ReactNode][]
  const titles = c.honours.filter((h) => h[3] === 1)
  const seasons = [...c.teams].sort((a, b) => b.y - a.y)
  return (
    <>
      <div className="grid g-2">
        <section className="card info">
          <Sec>Datos del club</Sec>
          <dl>
            {rows.map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </span>
            ))}
          </dl>
          {c.parent && (
            <p className="muted" style={{ marginTop: 14 }}>
              Equipo vinculado a{' '}
              <a href={href.club(c.parent[0])} style={{ color: 'var(--c-dk)', fontWeight: 600 }}>
                {c.parent[1]}
              </a>
            </p>
          )}
          {c.filiales.length > 0 && (
            <>
              <h3 style={{ font: '700 15px var(--cond)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--tx2)', margin: '20px 0 8px' }}>Filiales y vinculados</h3>
              {c.filiales.map(([r, n, l]) => (
                <a key={r} href={href.club(r)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <Crest url={l} name={n} size={24} />
                  {n}
                </a>
              ))}
            </>
          )}
        </section>
        <section className="card">
          <Sec aside={`${titles.length} títulos`}>Palmarés</Sec>
          {c.honours.length ? (
            <div className="tw">
              <table className="t">
                <tbody>
                  {c.honours.map((h, i) => (
                    <tr key={i}>
                      <td className="l">{h[2]}</td>
                      <td className="l b" style={{ color: h[3] ? 'var(--c-dk)' : 'var(--tx2)' }}>
                        {h[3] ? 'Campeón' : 'Finalista'}
                      </td>
                      <td className="l hide-m muted">{h[4] ? `${h[3] ? 'ante' : 'perdió ante'} ${h[4]}` : ''}</td>
                      <td>{h[5] ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Sin títulos registrados</div>
          )}
        </section>
      </div>
      {c.history && (
        <section className="card" style={{ marginTop: 20 }}>
          <Sec>Historia</Sec>
          <div className="prose">
            {c.history
              .split(/\n+/)
              .filter(Boolean)
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        </section>
      )}
      <section className="card" style={{ marginTop: 20 }}>
        <Sec aside={`${seasons.length} temporadas en la base de datos`}>Temporadas</Sec>
        <div className="tw">
          <table className="t">
            <tbody>
              {seasons.map((s) => (
                <tr key={s.t} className="link" onClick={() => (location.hash = href.club(c.ref, s.y).slice(1))}>
                  <td className="l">{seasonLabel(s.y)}</td>
                  <td className="l b">
                    <span className="who">
                      <Crest url={s.logo ?? c.logo} name={s.name} c1={c.c1} size={22} />
                      {s.name}
                    </span>
                  </td>
                  <td className="l">
                    <span className="lgp">{compOf(meta, s.code)?.name ?? s.code}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
