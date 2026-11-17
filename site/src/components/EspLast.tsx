/** Últimos partidos de los españoles fuera de las ligas españolas («anoche»). */
import { valColor } from '../lib/color'
import { compOf, type Days, type Meta } from '../lib/data'
import { dateShort } from '../lib/fmt'
import { href } from '../lib/router'
import { Avatar, Crest, src } from './ui'

export function EspLast({ days, meta, limit }: { days: Days; meta: Meta; limit?: number }) {
  const rows = (days.esp ?? []).slice(0, limit)
  if (!rows.length) return <div className="empty">Sin partidos de españoles fuera en los últimos días</div>
  return (
    <div className="esl">
      {rows.map((r) => {
        const pl = days.pl[r.p]
        const t = days.teams[r.t]
        const o = days.teams[r.opp]
        const c = compOf(meta, r.code)
        return (
          <a key={r.p + r.g} className="esl-r" href={href.game(r.g)}>
            <Avatar url={pl?.[1]} name={pl?.[0] ?? '?'} size={46} />
            <div className="esl-m">
              <b>{pl?.[0]}</b>
              <span>
                <Crest url={t?.l} name={t?.n ?? ''} c1={t?.c1} size={15} />
                {t?.s ?? t?.n} · <em className={r.won ? 'w' : 'l'}>{r.won ? 'V' : 'D'} {r.sc}</em> <i>vs {o?.a ?? o?.s ?? o?.n}</i>
              </span>
              <span className="esl-c">
                {c?.logo && <img src={src(c.logo)} alt="" />}
                {c?.short ?? c?.name} · {dateShort(r.d)} · {r.min} min
              </span>
            </div>
            <div className="esl-n">
              <b>{r.pts}</b>
              <span>pts</span>
            </div>
            <div className="esl-n hide-m">
              <b>{r.reb}</b>
              <span>reb</span>
            </div>
            <div className="esl-n hide-m">
              <b>{r.ast}</b>
              <span>ast</span>
            </div>
            <span className="badge" style={{ background: valColor(r.val) }}>
              {r.val}
            </span>
          </a>
        )
      })}
    </div>
  )
}
