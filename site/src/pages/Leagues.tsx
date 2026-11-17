import { useEffect } from 'react'
import { countryName } from '../components/Header'
import { Crest, Foot, Sec, src, Court } from '../components/ui'
import { cssVars } from '../lib/color'
import type { Meta } from '../lib/data'
import { href } from '../lib/router'

export default function Leagues({ meta }: { meta: Meta }) {
  useEffect(() => {
    document.title = 'Competiciones · d3 basket'
  }, [])
  const groups: [string, typeof meta.comps][] = [...new Set(meta.comps.filter((c) => c.tier != null).map((c) => c.country))].map((cn) => [countryName(cn), meta.comps.filter((c) => c.country === cn && c.tier != null)])
  const champs = meta.comps.filter((c) => c.tier == null)
  if (champs.length) groups.push(['Copas y campeonatos de España', champs])
  const total = meta.comps.reduce((n, c) => n + c.eds.length, 0)
  return (
    <div style={cssVars({ dk: '#0a2a5c', lt: '#2f7be0' })}>
      <section className="hero short">
        <Court />
        <div className="ghost">Ligas</div>
        <div className="wrap">
          <span className="kicker" style={{ paddingLeft: 14 }}>
            {meta.comps.length} competiciones · {total} temporadas
          </span>
          <h1>Competiciones</h1>
        </div>
      </section>
      <main className="wrap page">
        {groups.map(([name, cs], i) => (
          <section className="card" key={name} style={{ marginTop: i ? 20 : -50, position: 'relative', zIndex: 2 }}>
            <Sec>{name}</Sec>
            <div className="comps">
              {cs.map((c) => (
                <a key={c.code} className="cc" href={href.comp(c.code)} style={{ ['--lc' as string]: c.color ?? 'var(--accent)' }}>
                  {c.logo ? <img src={src(c.logo)} alt="" /> : <Crest name={c.name} c1={c.color} size={44} />}
                  <div>
                    <b>{c.name}</b>
                    <span>
                      {c.eds.length} {c.eds.length === 1 ? 'temporada' : 'temporadas'} · {c.eds.at(-1)?.label}
                      {c.eds.length > 1 ? ` a ${c.eds[0].label}` : ''}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}
      </main>
      <Foot updated={meta.updated} />
    </div>
  )
}
