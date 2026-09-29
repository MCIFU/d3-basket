/**
 * Trayectoria del jugador: une las temporadas con estadística (ACB y FEB) con las
 * etapas de la FEB (todas las categorías) y las muestra como línea de tiempo y gráfica.
 */
import type { ReactNode } from 'react'
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

const compKey = (c: string) => {
  const u = c.toUpperCase()
  if (/^(ACB|LIGA ENDESA)/.test(u)) return 'ACB'
  if (/^(LEB_ORO|PRIMERA FEB|LEB ORO)/.test(u)) return 'LEB_ORO'
  if (/^(LEB_PLATA|SEGUNDA FEB|LEB PLATA)/.test(u)) return 'LEB_PLATA'
  return u
}
const COMP_NAME: Record<string, string> = { ACB: 'LIGA ENDESA', LEB_ORO: 'PRIMERA FEB', LEB_PLATA: 'SEGUNDA FEB' }
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
      competition: s.competition,
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
