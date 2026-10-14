/**
 * Trayectoria del jugador: une las temporadas con estadística (ACB y FEB) con las
 * etapas de la FEB (todas las categorías) y las muestra como línea de tiempo y gráfica.
 */
import { useState, type ReactNode } from 'react'
import type { CareerLine, PlayerData, PlayerStatRow, TrajectoryRow } from '../../../shared/api'
import { CompetitionBadge, TeamLogo, competitionStyle } from '../components'
import { int, num, pct } from '../format'
import { href } from '../router'

// ───────────────────────── Modelo ─────────────────────────

export interface CareerEntry {
  year: number
  label: string
  competition: string
  club: string
  team?: string | null
  clubRef?: string | null
  logo?: string | null
  stats?: TrajectoryRow
  license?: string | null
}

// Nombres antiguos de las categorías FEB: LEB Oro = Primera FEB, LEB Plata (LEB 2) = Segunda FEB
// y Liga EBA = Tercera FEB. Las licencias de la FEB usan el nombre de cada época.
export const compKey = (c: string) => {
  const u = c.toUpperCase().trim()
  if (/^(ACB|LIGA ENDESA)/.test(u)) return 'ACB'
  if (/^(LEB_ORO|PRIMERA FEB|LEB ORO|LEB)$/.test(u)) return 'LEB_ORO'
  if (/^(LEB_PLATA|SEGUNDA FEB|LEB PLATA|LEB 2)$/.test(u)) return 'LEB_PLATA'
  if (/^(TERCERA_FEB|TERCERA FEB|LIGA EBA|EBA)$/.test(u)) return 'TERCERA_FEB'
  return u
}
const COMP_NAME: Record<string, string> = { ACB: 'LIGA ENDESA', LEB_ORO: 'PRIMERA FEB', LEB_PLATA: 'SEGUNDA FEB', TERCERA_FEB: 'TERCERA FEB' }
const seasonLabel = (y: number) => `${y}-${String(y + 1).slice(-2)}`

export function buildCareer(data: PlayerData): CareerEntry[] {
  const entries: CareerEntry[] = data.trajectory.map((t) => ({
    year: t.start_year,
    label: t.label,
    competition: COMP_NAME[t.competition_code] ?? t.competition_code,
    club: t.team_name,
    team: t.team_name,
    clubRef: t.club_ref,
    logo: t.logo,
    stats: t
  }))
  for (const s of data.stints) {
    if (/entrenador|t[eé]cnico|delegado/i.test(s.license ?? '')) continue
    const same = entries.find((e) => e.year === s.season_start_year && compKey(e.competition) === compKey(s.competition) && !e.license)
    if (same) {
      same.license = s.license
      same.team = s.team_name ?? same.team
      continue
    }
    entries.push({
      year: s.season_start_year,
      label: seasonLabel(s.season_start_year),
      competition: COMP_NAME[compKey(s.competition)] ?? s.competition,
      club: s.club_name,
      team: s.team_name,
      license: s.license
    })
  }
  return entries.sort((a, b) => b.year - a.year || (b.stats?.games ?? 0) - (a.stats?.games ?? 0))
}

export function careerSummary(entries: CareerEntry[]) {
  const years = [...new Set(entries.map((e) => e.year))]
  const clubs = [...new Set(entries.map((e) => (e.clubRef ?? e.club).toLowerCase()))]
  const comps = [...new Set(entries.map((e) => compKey(e.competition)))]
  const acb = entries.filter((e) => compKey(e.competition) === 'ACB')
  return {
    seasons: years.length,
    clubs: clubs.length,
    from: Math.min(...years),
    to: Math.max(...years),
    competitions: comps.map((c) => COMP_NAME[c] ?? c),
    acbDebut: acb.length ? Math.min(...acb.map((e) => e.year)) : undefined
  }
}

// ───────────────────────── Línea de tiempo ─────────────────────────

export function CareerTimeline({ entries, limit }: { entries: CareerEntry[]; limit?: number }) {
  const years = [...new Set(entries.map((e) => e.year))].slice(0, limit)
  return (
    <div className="timeline">
      {years.map((y) => {
        const list = entries.filter((e) => e.year === y)
        const color = competitionStyle(list[0].competition).bg
        return (
          <div key={y} className="tl-season">
            <div className="tl-year">{seasonLabel(y)}</div>
            <div className="tl-rail">
              <span className="tl-dot" style={{ ['--c' as string]: color }} />
            </div>
            <div className="tl-entries">
              {list.map((e, i) => {
                const body = (
                  <>
                    <span className="tl-logo">
                      <TeamLogo src={e.logo} name={e.team ?? e.club} size={30} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="club">{e.team ?? e.club}</span>
                        <CompetitionBadge name={e.competition} />
                      </div>
                      <div className="sub">
                        {e.team && e.team !== e.club ? e.club : ''}
                        {e.stats ? `${e.team && e.team !== e.club ? ' · ' : ''}${e.stats.games} partidos${e.stats.playoff_games ? ` (${e.stats.playoff_games} de playoff)` : ''}` : e.license && !/jugador/i.test(e.license) ? e.license : ''}
                      </div>
                    </span>
                    {e.stats ? (
                      <span className="tl-stats">
                        <span>
                          <b>{num(e.stats.ppg)}</b>PTS
                        </span>
                        <span>
                          <b>{num(e.stats.rpg)}</b>REB
                        </span>
                        <span>
                          <b>{num(e.stats.apg)}</b>AST
                        </span>
                        <span>
                          <b>{num(e.stats.pirpg)}</b>VAL
                        </span>
                      </span>
                    ) : (
                      <span className="small muted">Sin estadísticas</span>
                    )}
                  </>
                )
                return e.clubRef ? (
                  <a key={i} className="tl-entry" href={href.club(e.clubRef, e.team ?? e.club, undefined, e.year)}>
                    {body}
                  </a>
                ) : (
                  <div key={i} className="tl-entry">
                    {body}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────── Gráfica ─────────────────────────

export function CareerChart({ rows }: { rows: TrajectoryRow[] }) {
  // Una barra por temporada (si jugó en dos clubes, se suman).
  const byYear = new Map<number, { games: number; pts: number; pir: number }>()
  for (const r of rows) {
    const e = byYear.get(r.start_year) ?? { games: 0, pts: 0, pir: 0 }
    byYear.set(r.start_year, { games: e.games + r.games, pts: e.pts + r.pts, pir: e.pir + r.pir })
  }
  const data = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, v]) => ({ y, ppg: v.games ? v.pts / v.games : 0, pir: v.games ? v.pir / v.games : 0 }))
  if (data.length < 2) return null
  const W = 820
  const H = 230
  const pad = { l: 34, r: 12, t: 22, b: 30 }
  const max = Math.max(5, ...data.map((d) => Math.max(d.ppg, d.pir))) * 1.15
  const step = (W - pad.l - pad.r) / data.length
  const x = (i: number) => pad.l + step * i + step / 2
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const bw = Math.min(38, step * 0.55)
  const ticks = [0, max / 3, (2 * max) / 3].map((t) => Math.round(t))
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.pir)}`).join(' ')
  return (
    <div>
      <svg className="career-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Puntos y valoración por temporada">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line-2)" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.y}>
            <rect className="cbar" x={x(i) - bw / 2} y={y(d.ppg)} width={bw} height={y(0) - y(d.ppg)} rx={4}>
              <title>{`${seasonLabel(d.y)}: ${num(d.ppg)} puntos por partido`}</title>
            </rect>
            <text className="val-label" x={x(i)} y={y(d.ppg) - 5} textAnchor="middle">
              {num(d.ppg)}
            </text>
            <text x={x(i)} y={H - 10} textAnchor="middle">
              {`${String(d.y).slice(-2)}-${String(d.y + 1).slice(-2)}`}
            </text>
          </g>
        ))}
        <path className="line" d={line} />
        {data.map((d, i) => (
          <circle key={d.y} className="pt" cx={x(i)} cy={y(d.pir)} r={4.5}>
            <title>{`${seasonLabel(d.y)}: ${num(d.pir)} de valoración por partido`}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i style={{ background: 'var(--brand)' }} />
          Puntos por partido
        </span>
        <span>
          <i style={{ background: 'var(--navy-2)', borderRadius: '50%' }} />
          Valoración por partido
        </span>
      </div>
    </div>
  )
}

// ───────────────────────── Tabla completa de estadísticas ─────────────────────────

export interface FullLine {
  label: ReactNode
  games: number
  starts?: number | null
  min: number
  pts: number
  fg2m: number
  fg2a: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  tov: number
  blk: number
  dunks?: number | null
  pf: number
  fd?: number | null
  pm?: number | null
  pir: number
  decimals: boolean
}

/** Temporada (totales de boxscores) → línea por partido, total o por 40 minutos. */
export function seasonLine(label: ReactNode, s: PlayerStatRow, mode: 'avg' | 'tot' | 'p40'): FullLine {
  const f = mode === 'tot' ? 1 : mode === 'avg' ? 1 / (s.games || 1) : 2400 / (s.seconds || 1)
  const v = (x: number) => x * f
  return {
    label,
    games: s.games,
    starts: mode === 'tot' ? s.starts : null,
    min: mode === 'tot' ? s.seconds / 60 : mode === 'avg' ? s.mpg : 40,
    pts: v(s.pts),
    fg2m: v(s.fg2m),
    fg2a: v(s.fg2a),
    fg3m: v(s.fg3m),
    fg3a: v(s.fg3a),
    ftm: v(s.ftm),
    fta: v(s.fta),
    oreb: v(s.oreb),
    dreb: v(s.dreb),
    reb: v(s.reb),
    ast: v(s.ast),
    stl: v(s.stl),
    tov: v(s.tov),
    blk: v(s.blk),
    dunks: v(s.dunks),
    pf: v(s.pf),
    fd: v(s.fd),
    pm: v(s.pm),
    pir: v(s.pir),
    decimals: mode !== 'tot'
  }
}

/** Línea de carrera oficial ACB (ya viene en totales o medias). */
export function careerLine(label: ReactNode, l: CareerLine, avg: boolean): FullLine {
  return {
    label,
    games: l.games,
    starts: avg ? null : l.starts,
    min: l.seconds / 60,
    pts: l.points,
    fg2m: l.fg2m,
    fg2a: l.fg2a,
    fg3m: l.fg3m,
    fg3a: l.fg3a,
    ftm: l.ftm,
    fta: l.fta,
    oreb: l.oreb,
    dreb: l.dreb,
    reb: l.reb,
    ast: l.ast,
    stl: l.stl,
    tov: l.tov,
    blk: l.blk,
    dunks: l.dunks,
    pf: l.pf,
    fd: l.foulsDrawn,
    pm: l.plusMinus,
    pir: l.pir,
    decimals: avg
  }
}

export function FullStatsTable({ rows }: { rows: FullLine[] }) {
  const f = (l: FullLine, v: number | null | undefined) => (v == null ? '—' : l.decimals ? num(v) : int(v))
  const shot = (l: FullLine, m: number, a: number) => `${f(l, m)}/${f(l, a)}`
  const p = (m: number, a: number) => pct(a > 0 ? (100 * m) / a : null)
  const cols = ['PJ', 'TIT', 'MIN', 'PTS', 'T2', 'T2%', 'T3', 'T3%', 'TL', 'TL%', 'TC%', 'RO', 'RD', 'REB', 'AST', 'ROB', 'PÉR', 'TAP', 'MAT', 'FC', 'FR', '+/−', 'VAL', 'TS%', 'eFG%']
  const titles: Record<string, string> = {
    TIT: 'Partidos como titular',
    TC: 'Tiros de campo',
    RO: 'Rebotes ofensivos',
    RD: 'Rebotes defensivos',
    ROB: 'Robos',
    PÉR: 'Pérdidas',
    TAP: 'Tapones',
    MAT: 'Mates',
    FC: 'Faltas cometidas',
    FR: 'Faltas recibidas',
    VAL: 'Valoración',
    'TS%': 'True Shooting',
    'eFG%': 'Tiro de campo efectivo'
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="num" title={titles[c.replace('%', '')] ?? titles[c]} style={{ cursor: 'default' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const fga = l.fg2a + l.fg3a
            const fgm = l.fg2m + l.fg3m
            return (
              <tr key={i}>
                <td>
                  <b>{l.label}</b>
                </td>
                <td className="num">{int(l.games)}</td>
                <td className="num">{l.starts == null ? '—' : int(l.starts)}</td>
                <td className="num">{l.decimals ? num(l.min) : int(l.min)}</td>
                <td className="num">
                  <b>{f(l, l.pts)}</b>
                </td>
                <td className="num">{shot(l, l.fg2m, l.fg2a)}</td>
                <td className="num">{p(l.fg2m, l.fg2a)}</td>
                <td className="num">{shot(l, l.fg3m, l.fg3a)}</td>
                <td className="num">{p(l.fg3m, l.fg3a)}</td>
                <td className="num">{shot(l, l.ftm, l.fta)}</td>
                <td className="num">{p(l.ftm, l.fta)}</td>
                <td className="num">{p(fgm, fga)}</td>
                <td className="num">{f(l, l.oreb)}</td>
                <td className="num">{f(l, l.dreb)}</td>
                <td className="num">
                  <b>{f(l, l.reb)}</b>
                </td>
                <td className="num">
                  <b>{f(l, l.ast)}</b>
                </td>
                <td className="num">{f(l, l.stl)}</td>
                <td className="num">{f(l, l.tov)}</td>
                <td className="num">{f(l, l.blk)}</td>
                <td className="num">{f(l, l.dunks)}</td>
                <td className="num">{f(l, l.pf)}</td>
                <td className="num">{f(l, l.fd)}</td>
                <td className="num">{f(l, l.pm)}</td>
                <td className="num">
                  <b>{f(l, l.pir)}</b>
                </td>
                <td className="num">{pct(fga + l.fta > 0 ? (100 * l.pts) / (2 * (fga + 0.44 * l.fta)) : null)}</td>
                <td className="num">{pct(fga > 0 ? (100 * (fgm + 0.5 * l.fg3m)) / fga : null)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────── Tabla de carrera ─────────────────────────

const SECTION_LABEL: Record<string, string> = { liga: 'Liga', filial: 'Filial', copa: 'Copa', europa: 'Europa', seleccion: 'Selección' }

/**
 * La carrera temporada a temporada: lo básico de un vistazo (partidos, puntos, rebotes,
 * asistencias y valoración) y, al desplegar una fila, el resto de su estadística.
 */
export function CareerTable({ entries, limit }: { entries: CareerEntry[]; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const years = [...new Set(entries.map((e) => e.year))].slice(0, limit)
  const shown = entries.filter((e) => years.includes(e.year))
  const withStats = shown.filter((e) => e.stats)
  const tot = withStats.reduce(
    (a, e) => ({ g: a.g + e.stats!.games, pts: a.pts + e.stats!.pts, reb: a.reb + e.stats!.reb, ast: a.ast + e.stats!.ast, pir: a.pir + e.stats!.pir }),
    { g: 0, pts: 0, reb: 0, ast: 0, pir: 0 }
  )
  const per = (v: number) => (tot.g ? num(v / tot.g) : '—')
  return (
    <div className="table-wrap">
      <table className="table career-table">
        <thead>
          <tr>
            <th>Temporada</th>
            <th>Equipo</th>
            <th>Liga</th>
            <th className="num">PJ</th>
            <th className="num">PTS</th>
            <th className="num">REB</th>
            <th className="num">AST</th>
            <th className="num">VAL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {years.flatMap((y) => {
            const list = shown.filter((e) => e.year === y)
            return list.flatMap((e, i) => {
              const key = `${y}-${i}-${e.team ?? e.club}-${e.competition}`
              const st = e.stats
              const isOpen = open === key
              const team = e.clubRef ? (
                <a className="team-link" href={href.club(e.clubRef, e.team ?? e.club, undefined, e.year)}>
                  <TeamLogo src={e.logo} name={e.team ?? e.club} size={24} />
                  <span>{e.team ?? e.club}</span>
                </a>
              ) : (
                <span className="team-link">
                  <TeamLogo src={e.logo} name={e.team ?? e.club} size={24} />
                  <span>{e.team ?? e.club}</span>
                </span>
              )
              const rows = [
                <tr key={key} className={`${i === 0 ? 'season-first' : ''} ${st ? 'has-stats' : 'no-stats'}`} onClick={() => st && setOpen(isOpen ? null : key)}>
                  <td className="ct-season">{i === 0 ? <b>{seasonLabel(y)}</b> : null}</td>
                  <td>
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      {team}
                      {st && st.section !== 'liga' && <span className={`chip ct-sec sec-${st.section}`}>{SECTION_LABEL[st.section]}</span>}
                    </span>
                  </td>
                  <td>
                    <CompetitionBadge name={e.competition} />
                  </td>
                  {st ? (
                    <>
                      <td className="num">
                        <b>{st.games}</b>
                      </td>
                      <td className="num ct-main">{num(st.ppg)}</td>
                      <td className="num ct-main">{num(st.rpg)}</td>
                      <td className="num ct-main">{num(st.apg)}</td>
                      <td className="num ct-main ct-val">{num(st.pirpg)}</td>
                      <td className="num">
                        <button className="ct-more" aria-expanded={isOpen} aria-label="Más estadísticas">
                          {isOpen ? '−' : '+'}
                        </button>
                      </td>
                    </>
                  ) : (
                    <td colSpan={6} className="muted small">
                      Licencia sin estadística publicada
                    </td>
                  )}
                </tr>
              ]
              if (st && isOpen)
                rows.push(
                  <tr key={key + '-x'} className="ct-extra">
                    <td />
                    <td colSpan={8}>
                      <div className="ct-extra-grid">
                        {[
                          ['Minutos', num(st.mpg)],
                          ['Tiros de 2', `${pct(st.fg2_pct)} · ${st.fg2m}/${st.fg2a}`],
                          ['Triples', `${pct(st.fg3_pct)} · ${st.fg3m}/${st.fg3a}`],
                          ['Tiros libres', `${pct(st.ft_pct)} · ${st.ftm}/${st.fta}`],
                          ['True shooting', pct(st.ts_pct)],
                          ['Reb. ofensivos', num(st.orpg)],
                          ['Reb. defensivos', num(st.drpg)],
                          ['Robos', num(st.spg)],
                          ['Tapones', num(st.bpg)],
                          ['Pérdidas', num(st.tpg)],
                          ['Faltas', num(st.pfpg)],
                          ['Victorias', `${st.wins} de ${st.games}`],
                          ...(st.playoff_games ? [['Playoff', `${st.playoff_games} partidos`]] : []),
                          ['Totales', `${int(st.pts)} pts · ${int(st.reb)} reb · ${int(st.ast)} ast`]
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span>{k}</span>
                            <b>{v}</b>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              return rows
            })
          })}
        </tbody>
        {tot.g > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3}>
                <b>Carrera</b> <span className="muted small">· {years.length} temporadas con datos · media por partido</span>
              </td>
              <td className="num">{int(tot.g)}</td>
              <td className="num">{per(tot.pts)}</td>
              <td className="num">{per(tot.reb)}</td>
              <td className="num">{per(tot.ast)}</td>
              <td className="num">{per(tot.pir)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
