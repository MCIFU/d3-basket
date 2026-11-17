import { useEffect, useMemo, useState } from 'react'
import { Avatar, Court, Crest, Foot, Loading, Sec, SortTable, type Col } from '../components/ui'
import { cssVars } from '../lib/color'
import { countryName } from '../components/Header'
import { S, compOf, loadEd, useLoad, type EdFile, type Meta } from '../lib/data'
import { age, flag, n1, per, POS_SHORT, seasonLabel, ts } from '../lib/fmt'
import { href, useQuery } from '../lib/router'
import { minGames, players, type PAgg } from '../lib/stats'

const POSITIONS: [string, string][] = [
  ['', 'Todas'],
  ['PG', 'Bases'],
  ['SG', 'Escoltas'],
  ['SF', 'Aleros'],
  ['PF', 'Ala-pívots'],
  ['C', 'Pívots']
]
const AGES: [string, string][] = [
  ['', 'Cualquier edad'],
  ['21', 'Sub-21'],
  ['23', 'Sub-23'],
  ['25', 'Sub-25'],
  ['30', 'Hasta 30'],
  ['31+', '31 o más']
]

export default function Players({ meta }: { meta: Meta }) {
  const main = meta.comps.filter((c) => c.tier != null && c.eds.length)
  const [code, setCode] = useQuery('c', 'ACB')
  const comp = compOf(meta, code) ?? main[0]
  const edRef = comp.eds.find((e) => e.fin > 0) ?? comp.eds[0]
  const ed = useLoad(() => loadEd(edRef.id), [edRef.id])
  useEffect(() => {
    document.title = 'Jugadores · d3 basket'
  }, [])
  return (
    <div style={cssVars({ dk: '#0a2a5c', lt: '#2f7be0' })}>
      <section className="hero short">
        <Court />
        <div className="ghost">Jugadores</div>
        <div className="wrap">
          <span className="kicker" style={{ paddingLeft: 14 }}>
            Explorador · temporada {seasonLabel(edRef.y)}
          </span>
          <h1>
            <small>Encuentra a tu</small>Jugador
          </h1>
          <div className="days" role="tablist" aria-label="Competición">
            {main.map((c) => (
              <button key={c.code} className={c.code === comp.code ? 'on' : ''} onClick={() => setCode(c.code)} role="tab" aria-selected={c.code === comp.code}>
                {c.short ?? c.name}
                <small>{countryName(c.country)}</small>
              </button>
            ))}
          </div>
        </div>
      </section>
      <main className="wrap page">{ed === undefined ? <Loading /> : !ed || ed instanceof Error ? <div className="card empty">Sin datos</div> : <Explorer ed={ed} compName={comp.name} key={ed.id} />}</main>
      <Foot updated={meta.updated} />
    </div>
  )
}

function Explorer({ ed, compName }: { ed: EdFile; compName: string }) {
  const [pos, setPos] = useState('')
  const [nat, setNat] = useState('')
  const [ageMax, setAge] = useState('')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'pg' | '36'>('pg')
  const tm = useMemo(() => new Map(ed.teams.map((t) => [t.id, t])), [ed])
  const all = useMemo(() => players(ed), [ed])
  const minG = minGames(all)
  const [onlyRegular, setReg] = useState(true)
  const rows = all.filter((r) => {
    const pl = ed.pl[r.p]
    if (!pl) return false
    if (onlyRegular && r.gp < minG) return false
    if (pos && pl[3] !== pos && !(pos === 'PG' && pl[3] === 'G') && !(pos === 'SF' && pl[3] === 'F')) return false
    if (nat === 'es' && pl[4] !== 'España') return false
    if (nat === 'ex' && (pl[4] === 'España' || !pl[4])) return false
    const a = age(pl[5])
    if (ageMax === '31+' ? !(a != null && a >= 31) : ageMax && !(a != null && a <= Number(ageMax))) return false
    if (q && !pl[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())) return false
    return true
  })
  // Por partido o por 36 minutos (para comparar a jugadores con distinto papel).
  const k = (r: PAgg) => (mode === 'pg' ? 1 : r.s[S.sec] > 0 ? (36 * 60 * r.gp) / r.s[S.sec] : 0)
  const m = (r: PAgg, key: keyof ReturnType<typeof per>) => per(r.s, r.gp)[key] * (key === 'min' ? 1 : k(r))
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
            <Avatar url={pl(r)?.[1]} name={pl(r)?.[0] ?? '?'} size={34} />
            <span>
              {pl(r)?.[0]} {flag(pl(r)?.[4] ?? null)}
              <small style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Crest url={t?.logo} name={t?.name ?? ''} c1={t?.c1} size={14} />
                {t?.short ?? t?.name}
              </small>
            </span>
          </span>
        )
      }
    },
    { k: 'age', label: 'Edad', hideM: true, asc: true, get: (r) => age(pl(r)?.[5] ?? null) },
    { k: 'pos', label: 'Pos', hideM: true, l: true, get: (r) => pl(r)?.[3] ?? '', fmt: (r) => (pl(r)?.[3] ? POS_SHORT[pl(r)![3]!] : '–') },
    { k: 'gp', label: 'PJ', get: (r) => r.gp },
    { k: 'min', label: 'Min', get: (r) => m(r, 'min'), fmt: (r) => n1(m(r, 'min')) },
    { k: 'pts', label: 'Pts', b: true, get: (r) => m(r, 'pts'), fmt: (r) => n1(m(r, 'pts')) },
    { k: 'reb', label: 'Reb', get: (r) => m(r, 'reb'), fmt: (r) => n1(m(r, 'reb')) },
    { k: 'ast', label: 'Ast', get: (r) => m(r, 'ast'), fmt: (r) => n1(m(r, 'ast')) },
    { k: 'stl', label: 'Rob', hideM: true, get: (r) => m(r, 'stl'), fmt: (r) => n1(m(r, 'stl')) },
    { k: 'blk', label: 'Tap', hideM: true, get: (r) => m(r, 'blk'), fmt: (r) => n1(m(r, 'blk')) },
    { k: 'p3', label: 'T3 %', hideM: true, get: (r) => (r.s[S.f3a] >= 10 ? r.s[S.f3m] / r.s[S.f3a] : null), fmt: (r) => (r.s[S.f3a] ? n1((100 * r.s[S.f3m]) / r.s[S.f3a]) : '–') },
    { k: 'ts', label: 'TS %', hideM: true, get: (r) => ts(r.s), fmt: (r) => n1((ts(r.s) ?? 0) * 100) },
    { k: 'val', label: 'Val', b: true, get: (r) => m(r, 'val'), fmt: (r) => n1(m(r, 'val')) }
  ]
  const Group = ({ label, value, set, items }: { label: string; value: string; set: (v: string) => void; items: [string, string][] }) => (
    <div className="fgroup" role="group" aria-label={label}>
      <span className="flabel">{label}</span>
      <div className="chips">
        {items.map(([k2, l]) => (
          <button key={k2} className={`chip ${value === k2 ? 'on' : ''}`} aria-pressed={value === k2} onClick={() => set(k2)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <>
      <section className="card filters" style={{ marginTop: -50, position: 'relative', zIndex: 2 }}>
        <div className="search-in">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${compName}`} aria-label="Buscar jugador por nombre" />
        </div>
        <Group label="Posición" value={pos} set={setPos} items={POSITIONS} />
        <Group
          label="Origen"
          value={nat}
          set={setNat}
          items={[
            ['', 'Todos'],
            ['es', `${flag('España')} Españoles`],
            ['ex', 'Extranjeros']
          ]}
        />
        <Group label="Edad" value={ageMax} set={setAge} items={AGES} />
        <Group
          label="Medias"
          value={mode}
          set={(v) => setMode(v as 'pg' | '36')}
          items={[
            ['pg', 'Por partido'],
            ['36', 'Por 36 minutos']
          ]}
        />
        <Group
          label="Muestra"
          value={onlyRegular ? 'r' : 'a'}
          set={(v) => setReg(v === 'r')}
          items={[
            ['r', `Habituales (${minG}+ partidos)`],
            ['a', 'Todos']
          ]}
        />
      </section>
      <section className="card" style={{ marginTop: 20 }}>
        <Sec aside={`${rows.length} de ${all.length} jugadores · ${mode === 'pg' ? 'medias por partido' : 'proyección a 36 minutos'}`}>Resultados</Sec>
        {rows.length ? <SortTable rows={rows} cols={cols} initial="val" onRow={(r) => href.player(r.p)} limit={60} /> : <div className="empty">Ningún jugador cumple los filtros</div>}
      </section>
    </>
  )
}
