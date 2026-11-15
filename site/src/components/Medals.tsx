/** Medallero de un jugador: títulos con sus clubes y medallas con la selección. */
import type { Medal, Title } from '../lib/data'
import { href } from '../lib/router'
import { Crest, Sec, src } from './ui'

const COMP: Record<Title['k'], { name: string; logo?: string; order: number }> = {
  euroleague: { name: 'EuroLeague', logo: 'media/leagues/euroleague.png', order: 0 },
  liga: { name: 'Liga ACB', logo: 'media/leagues/acb.svg', order: 1 },
  copa: { name: 'Copa del Rey', order: 2 },
  supercopa: { name: 'Supercopa', order: 3 },
  eurocup: { name: 'EuroCup', logo: 'media/leagues/eurocup.png', order: 4 },
  bcl: { name: 'Champions League', logo: 'media/leagues/bcl.png', order: 5 }
}
const EVENT: Record<Medal['kind'], string> = { JJOO: 'Juegos Olímpicos', Mundial: 'Mundial', EuroBasket: 'EuroBasket' }
const MEDAL_ORDER = { oro: 0, plata: 1, bronce: 2 }

export const Trophy = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z" fill="currentColor" />
    <rect x="7" y="20" width="10" height="2" rx="1" fill="currentColor" />
  </svg>
)

export function MedalDisc({ m, size = 54 }: { m: Medal['medal']; size?: number }) {
  return (
    <span className={`medal ${m}`} style={{ width: size, height: size }} aria-label={`Medalla de ${m}`}>
      <span className="rib" />
      <span className="disc">{m === 'oro' ? '1' : m === 'plata' ? '2' : '3'}</span>
    </span>
  )
}

/** Resumen corto para la portada del jugador. */
export function MedalSummary({ titles, medals }: { titles: Title[]; medals: Medal[] }) {
  const won = titles.filter((t) => t.won).length
  if (!won && !medals.length) return null
  const by = (k: Medal['medal']) => medals.filter((m) => m.medal === k).length
  return (
    <a className="msum" href="#palmares" onClick={(e) => (e.preventDefault(), document.getElementById('palmares')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
      {won > 0 && (
        <span className="it">
          <Trophy size={20} />
          <b>{won}</b> {won === 1 ? 'título' : 'títulos'}
        </span>
      )}
      {medals.length > 0 && (
        <span className="it">
          {(['oro', 'plata', 'bronce'] as const).map((k) => by(k) > 0 && <span key={k} className="mini"><MedalDisc m={k} size={20} /><b>{by(k)}</b></span>)}
          <span>con España</span>
        </span>
      )}
    </a>
  )
}

export function Medals({ titles, medals }: { titles: Title[]; medals: Medal[] }) {
  const won = titles.filter((t) => t.won)
  if (!won.length && !medals.length && !titles.length) return null
  const comps = [...new Set(titles.map((t) => t.k))].sort((a, b) => COMP[a].order - COMP[b].order)
  const kinds = (['JJOO', 'Mundial', 'EuroBasket'] as const).filter((k) => medals.some((m) => m.kind === k))
  const count = (k: Medal['medal']) => medals.filter((m) => m.medal === k).length
  return (
    <section className="card palmares" id="palmares" style={{ marginTop: 20 }}>
      <Sec aside={[won.length ? `${won.length} ${won.length === 1 ? 'título' : 'títulos'} con sus clubes` : null, medals.length ? `${medals.length} medallas con España` : null].filter(Boolean).join(' · ')}>Palmarés</Sec>
      {comps.length > 0 && (
        <>
          <h3 className="ph3">Con sus clubes</h3>
          <div className="trophies">
            {comps.map((k) => {
              const ts = titles.filter((t) => t.k === k).sort((a, b) => a.y - b.y)
              const w = ts.filter((t) => t.won)
              const lost = ts.length - w.length
              return (
                <div key={k} className={`trophy ${w.length ? '' : 'silver'}`}>
                  <div className="ttop">
                    <span className="cup">
                      <Trophy />
                    </span>
                    <div>
                      <div className="n">{w.length ? `×${w.length}` : '—'}</div>
                      <div className="cn">
                        {COMP[k].logo && <img src={src(COMP[k].logo)} alt="" />}
                        {COMP[k].name}
                      </div>
                    </div>
                  </div>
                  {w.length > 0 && (
                    <div className="yrs">
                      {w.map((t) => (
                        <a key={t.y + t.club} href={href.club(t.club, t.y)} title={`${t.name}${t.vs ? ` · ante ${t.vs}` : ''}${t.res ? ` (${t.res})` : ''}`}>
                          <Crest url={t.logo} name={t.name} size={16} />
                          {t.label}
                        </a>
                      ))}
                    </div>
                  )}
                  {lost > 0 && (
                    <div className="lost">
                      {lost} {lost === 1 ? 'final perdida' : 'finales perdidas'}: {ts.filter((t) => !t.won).map((t) => t.label).join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      {medals.length > 0 && (
        <>
          <h3 className="ph3">
            Con la selección española
            <span className="tally">
              {(['oro', 'plata', 'bronce'] as const).map((k) => count(k) > 0 && <span key={k}><MedalDisc m={k} size={18} /> {count(k)}</span>)}
            </span>
          </h3>
          <div className="events">
            {kinds.map((k) => (
              <div key={k} className="event">
                <div className="en">{EVENT[k]}</div>
                <div className="ms">
                  {medals
                    .filter((m) => m.kind === k)
                    .sort((a, b) => a.y - b.y || MEDAL_ORDER[a.medal] - MEDAL_ORDER[b.medal])
                    .map((m) => (
                      <div key={m.y} className="m">
                        <MedalDisc m={m.medal} />
                        <b>{m.y}</b>
                        {m.mvp && <span className="mvp">MVP</span>}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
