import { useEffect, useMemo, useState } from 'react'
import type { PlayerData, PlayerIndexRow, PlayerStatRow, StatBlock, TrajectoryRow } from '../../../shared/api'
import {
  CardPhoto,
  HalfCourt,
  CompetitionBadge,
  DataTable,
  Empty,
  ExternalLink,
  Loading,
  Minutes,
  PlayerPhoto,
  RankSheet,
  Section,
  Segmented,
  StatTile,
  Tabs,
  TeamLink,
  TeamLogo,
  useLoad,
  type Column
} from '../components'
import { LICENSE_LABEL, age, fmtBirth, fmtDate, fmtDay, initials, int, num, pct, shot, signed, teamColor } from '../format'
import { leagueTheme } from '../leagues'
import { href } from '../router'
import { ModeToggle, type StatMode } from './StatTables'
import { ReportCard } from './Scouting'
import { CareerChart, CareerTimeline, FullStatsTable, buildCareer, careerLine, careerSummary, seasonLine } from './Career'

// ───────────────────────── Índice ─────────────────────────

type SortKey = 'pirpg' | 'ppg' | 'games' | 'name'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'pirpg', label: 'valoración' },
  { id: 'ppg', label: 'puntos' },
  { id: 'games', label: 'partidos' },
  { id: 'name', label: 'nombre' }
]

/** Primero quien ha jugado esta temporada; dentro, por la estadística elegida. */
function sortPlayers(list: PlayerIndexRow[], key: SortKey): PlayerIndexRow[] {
  if (key === 'name') return [...list].sort((a, b) => a.display_name.localeCompare(b.display_name, 'es'))
  const v = (p: PlayerIndexRow) => (key === 'games' ? p.games : (p[key] ?? -1))
  return [...list].sort((a, b) => Number(b.games > 0) - Number(a.games > 0) || v(b) - v(a) || a.display_name.localeCompare(b.display_name, 'es'))
}

export function PlayersPage() {
  const [players, error] = useLoad(() => window.d3.players(), [])
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [pos, setPos] = useState('')
  const [league, setLeague] = useState('')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [sort, setSort] = useState<SortKey>('pirpg')
  const list = useMemo(
    () =>
      sortPlayers((players ?? []).filter(
        (p) =>
          (!q || p.display_name.toLowerCase().includes(q.toLowerCase()) || (p.nationality ?? '').toLowerCase().includes(q.toLowerCase())) &&
          (!team || p.team.club_ref === team) &&
          (!league || p.competition_code === league) &&
          (!pos || p.position === pos)
      ), sort),
    [players, q, team, pos, league, sort]
  )
  if (!players) return <Loading error={error} />
  const teams = [...new Map(players.map((p) => [p.team.club_ref, p.team])).values()].sort((a, b) => a.name.localeCompare(b.name))
  const positions = [...new Set(players.map((p) => p.position).filter(Boolean))] as string[]

  const columns: Column<PlayerIndexRow>[] = [
    {
      key: 'display_name',
      label: 'Jugador',
      render: (p) => (
        <a className="player-cell" href={href.player(p.player_ref, p.display_name)}>
          <PlayerPhoto nobg={p.photo_nobg} photo={p.photo} name={p.display_name} color={p.team.color} size={34} />
          <span className="name">{p.display_name}</span>
        </a>
      )
    },
    { key: 'team', label: 'Equipo', value: (p) => p.team.name, render: (p) => <TeamLink team={p.team} short /> },
    { key: 'jersey_number', label: '#', num: true, value: (p) => Number(p.jersey_number) },
    { key: 'position', label: 'Posición' },
    { key: 'nationality', label: 'Nacionalidad' },
    { key: 'age', label: 'Edad', num: true, value: (p) => age(p.birth_date), render: (p) => age(p.birth_date) ?? '—' },
    { key: 'height_cm', label: 'Altura', num: true, render: (p) => (p.height_cm ? `${p.height_cm}` : '—') },
    { key: 'games', label: 'PJ', num: true },
    { key: 'ppg', label: 'PTS', num: true, render: (p) => num(p.ppg) },
    { key: 'rpg', label: 'REB', num: true, render: (p) => num(p.rpg) },
    { key: 'apg', label: 'AST', num: true, render: (p) => num(p.apg) },
    { key: 'pirpg', label: 'VAL', num: true, render: (p) => num(p.pirpg) }
  ]

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Temporada en curso</div>
        <h1>Jugadores</h1>
        <p>
          {players.length} jugadores con licencia en la Liga Endesa, la Primera, la Segunda y la Tercera FEB.{' '}
          <a href={href.compare()}>Comparar dos jugadores →</a>
        </p>
      </div>
      <div className="card">
        <div className="row filter-bar" style={{ marginBottom: 16 }}>
          <input className="input" placeholder="Nombre o nacionalidad" aria-label="Buscar por nombre o nacionalidad" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={league} onChange={(e) => (setLeague(e.target.value), setTeam(''))}>
            <option value="">Todas las ligas</option>
            {[...new Set(players.map((p) => p.competition_code))].map((c) => (
              <option key={c} value={c}>
                {leagueTheme(c)?.name ?? c}
              </option>
            ))}
          </select>
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Todos los equipos</option>
            {teams.filter((t) => !league || players.some((p) => p.team.club_ref === t.club_ref && p.competition_code === league)).map((t) => (
              <option key={t.club_ref} value={t.club_ref}>
                {t.name}
              </option>
            ))}
          </select>
          <select className="select" value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">Todas las posiciones</option>
            {positions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Ordenar: {s.label}
              </option>
            ))}
          </select>
          <span className="small muted">{list.length} resultados</span>
          <span className="spacer" />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { id: 'cards', label: 'Fichas' },
              { id: 'table', label: 'Tabla' }
            ]}
          />
        </div>
        {view === 'table' ? (
          <DataTable rows={list} columns={columns} rowKey={(p) => `${p.player_ref}-${p.team.team_id}`} initialSort={{ key: 'pirpg', dir: 'desc' }} limit={60} />
        ) : (
          <div className="roster-grid">
            {list.slice(0, 120).map((p) => {
              const c = teamColor(p.team.color, '#13294d')
              return (
                <a key={`${p.player_ref}-${p.team.team_id}`} className="roster-card" href={href.player(p.player_ref, p.display_name)}>
                  <div className="rc-top" style={{ background: `linear-gradient(160deg, ${c}, ${c}aa)` }}>
                    {/^\d+$/.test(p.jersey_number ?? '') && <span className="rc-num">{p.jersey_number}</span>}
                    <CardPhoto src={p.photo_nobg} name={p.display_name} />
                  </div>
                  <div className="rc-body">
                    <div className="rc-name">{p.display_name}</div>
                    <div className="rc-sub row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <TeamLogo src={p.team.logo} name={p.team.name} size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[p.team.short_name ?? p.team.name, p.position].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    {!p.games ? (
                      <div className="rc-stats rc-empty">Sin partidos esta temporada</div>
                    ) : (
                    <div className="rc-stats">
                      <span>
                        <b>{num(p.ppg)}</b>PTS
                      </span>
                      <span>
                        <b>{num(p.rpg)}</b>REB
                      </span>
                      <span>
                        <b>{num(p.apg)}</b>AST
                      </span>
                      <span>
                        <b>{num(p.pirpg)}</b>VAL
                      </span>
                    </div>
                    )}
                  </div>
                </a>
              )
            })}
          </div>
        )}
        {view === 'cards' && list.length > 120 && <p className="note">Mostrando 120 de {list.length}. Usa los filtros o la vista de tabla.</p>}
      </div>
    </>
  )
}

// ───────────────────────── Ficha ─────────────────────────

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'trayectoria', label: 'Trayectoria' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'partidos', label: 'Partido a partido' },
  { id: 'scouting', label: 'Scouting' }
]

export function PlayerPage({ refId, tab = 'resumen' }: { refId: string; tab?: string }) {
  const [data, error] = useLoad(() => window.d3.player(refId), [refId])
  if (error) return <Loading error={error} />
  if (data === undefined) return <Loading />
  if (!data) return <Empty>No se ha encontrado este jugador.</Empty>
  const { player: p, current, season } = data
  const color = teamColor(current?.color, '#13294d')
  const facts: [string, string | null | undefined][] = [
    ['Nacimiento', p.birth_date ? `${fmtBirth(p.birth_date)} (${age(p.birth_date)} años)` : null],
    ['Lugar de nacimiento', [p.birth_place, p.birth_country].filter(Boolean).join(', ') || null],
    ['Nacionalidad', p.nationality],
    ['Posición', p.position],
    ['Altura', p.height_cm ? `${(p.height_cm / 100).toFixed(2).replace('.', ',')} m` : null],
    ['Licencia', current?.license_type ? (LICENSE_LABEL[current.license_type] ?? current.license_type) : null]
  ]

  return (
    <>
      <section className="hero player-hero" style={{ ['--club' as string]: color }}>
        <div className="hero-grid">
          <div className="portrait">
            <HeroPortrait srcs={[p.photo_nobg, p.photo]} name={p.display_name} />
          </div>
          <div className="info">
            <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
              {current?.jersey_number && <span className="jersey">{current.jersey_number}</span>}
              <div>
                {current && (
                  <div className="row" style={{ gap: 8 }}>
                    <a className="row" style={{ gap: 8, fontWeight: 700 }} href={href.club(current.club_ref, current.name)}>
                      <span style={{ background: '#fff', borderRadius: 8, padding: 3, display: 'inline-flex' }}>
                        <TeamLogo src={current.logo} name={current.name} size={24} />
                      </span>
                      {current.name} · {current.season_label}
                    </a>
                    <CompetitionBadge name={current.competition_code} />
                    {!current.is_active && <span className="chip">Baja</span>}
                  </div>
                )}
                <h1 style={{ marginTop: 6 }}>{p.display_name}</h1>
                {p.full_name !== p.display_name && <div style={{ opacity: 0.75 }}>{p.full_name}</div>}
              </div>
            </div>
            <div className="hero-facts">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="hero-fact">
                    <div className="k">{k}</div>
                    <div className="v">{v}</div>
                  </div>
                ))}
            </div>
            <div className="hero-actions">
              <a className="btn" href={href.newReport(p.ref, p.display_name)}>
                + Informe de scouting
              </a>
              <a className="btn btn-light" href={href.compare(p.ref)}>
                Comparar
              </a>
              {p.acb_url && (
                <ExternalLink url={p.acb_url}>
                  <span className="btn btn-light">Ficha en acb.com ↗</span>
                </ExternalLink>
              )}
              {Object.entries(p.socials).map(([k, url]) => (
                <ExternalLink key={k} url={url}>
                  <span className="btn btn-light">{k === 'twitter' ? 'X' : k[0].toUpperCase() + k.slice(1)}</span>
                </ExternalLink>
              ))}
            </div>
          </div>
          <div className="stats">
            {season ? (
              <div className="stat-tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(90px, 1fr))' }}>
                <StatTile label="Puntos" value={num(season.ppg)} />
                <StatTile label="Rebotes" value={num(season.rpg)} />
                <StatTile label="Asistencias" value={num(season.apg)} />
                <StatTile label="Valoración" value={num(season.pirpg)} />
                <StatTile label="Minutos" value={num(season.mpg)} />
                <StatTile label="Partidos" value={season.games} />
              </div>
            ) : (
              <div style={{ opacity: 0.75 }}>Sin minutos esta temporada.</div>
            )}
          </div>
        </div>
      </section>

      <Tabs active={tab} items={TABS.map((t) => ({ ...t, href: href.player(p.ref, p.display_name, t.id) }))} />

      {tab === 'resumen' && <PlayerSummary data={data} />}
      {tab === 'trayectoria' && <Trajectory data={data} />}
      {tab === 'estadisticas' && <PlayerStats data={data} />}
      {tab === 'partidos' && <GameLog data={data} />}
      {tab === 'scouting' && <PlayerReports data={data} />}
    </>
  )
}

function CareerHeader({ data }: { data: PlayerData }) {
  const entries = buildCareer(data)
  if (!entries.length) return null
  const s = careerSummary(entries)
  const acb = data.career?.acbTotals
  return (
    <div className="career-summary">
      <span className="chip brand">
        {s.seasons} temporadas ({s.from}–{s.to + 1})
      </span>
      <span className="chip">{s.clubs} clubes</span>
      {s.acbDebut && <span className="chip">Debut en la Liga Endesa: {s.acbDebut}-{String(s.acbDebut + 1).slice(-2)}</span>}
      {acb && <span className="chip">{int(acb.games)} partidos en la ACB</span>}
      {s.competitions.map((c) => (
        <CompetitionBadge key={c} name={c} />
      ))}
    </div>
  )
}

/** Retrato de la cabecera: prueba cada foto y, si ninguna carga, muestra las iniciales. */
function HeroPortrait({ srcs, name }: { srcs: (string | null | undefined)[]; name: string }) {
  const list = srcs.filter((s): s is string => !!s)
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [list[0]])
  if (i >= list.length) return <div className="ph-fallback">{initials(name)}</div>
  return <img key={list[i]} src={list[i]} alt={name} onError={() => setI((n) => n + 1)} />
}

type SheetRow = { key: keyof PlayerStatRow; label: string; value: (s: PlayerStatRow) => string; sub?: (s: PlayerStatRow) => string }
const SHEET: { title: string; rows: SheetRow[] }[] = [
  {
    title: 'Anotación',
    rows: [
      { key: 'ppg', label: 'Puntos', value: (s) => num(s.ppg), sub: (s) => `${int(s.pts)} en total` },
      { key: 'ts_pct', label: 'True shooting', value: (s) => pct(s.ts_pct), sub: (s) => `${s.fg2a + s.fg3a} tiros · ${s.fta} TL` },
      { key: 'fg2_pct', label: 'Tiros de 2', value: (s) => pct(s.fg2_pct), sub: (s) => `${s.fg2m}/${s.fg2a}` },
      { key: 'fg3_pct', label: 'Triples', value: (s) => pct(s.fg3_pct), sub: (s) => `${s.fg3m}/${s.fg3a}` },
      { key: 'ft_pct', label: 'Tiros libres', value: (s) => pct(s.ft_pct), sub: (s) => `${s.ftm}/${s.fta}` }
    ]
  },
  {
    title: 'Juego',
    rows: [
      { key: 'rpg', label: 'Rebotes', value: (s) => num(s.rpg), sub: (s) => `${num(s.orpg)} of. · ${num(s.drpg)} def.` },
      { key: 'apg', label: 'Asistencias', value: (s) => num(s.apg), sub: (s) => `${int(s.ast)} en total` },
      { key: 'spg', label: 'Robos', value: (s) => num(s.spg) },
      { key: 'bpg', label: 'Tapones', value: (s) => num(s.bpg) },
      { key: 'tpg', label: 'Pérdidas', value: (s) => num(s.tpg), sub: () => 'menos es mejor' }
    ]
  },
  {
    title: 'Impacto',
    rows: [
      { key: 'pirpg', label: 'Valoración', value: (s) => num(s.pirpg), sub: (s) => `${int(s.pir)} en total` },
      { key: 'mpg', label: 'Minutos', value: (s) => num(s.mpg), sub: (s) => `${s.games} partidos · ${s.starts} de titular` },
      { key: 'pmpg', label: 'Más/menos', value: (s) => (s.pmpg > 0 ? '+' : '') + num(s.pmpg), sub: (s) => `${signed(s.pm)} en total` }
    ]
  }
]

/** Hoja de estadística de la temporada con el puesto del jugador en su liga en cada fila. */
function StatSheet({ s, ranks, league }: { s: PlayerStatRow; ranks: PlayerData['ranks']; league?: string }) {
  const groups = SHEET.map((g) => ({
    title: g.title,
    rows: g.rows.map((r) => ({ label: r.label, value: r.value(s), sub: r.sub?.(s), rank: ranks[r.key as string] }))
  }))
  return (
    <>
      <RankSheet groups={groups} scope={league} />
      <p className="note">
        {Object.keys(ranks).length
          ? `Puesto entre los jugadores de ${league ?? 'su liga'} que han disputado al menos el 40 % de los partidos (los porcentajes exigen además un mínimo de intentos).`
          : 'Todavía no ha jugado el 40 % de los partidos de su liga: sin puesto en la clasificación de estadísticas.'}
      </p>
    </>
  )
}

const pctTxt = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)

/** Acierto por zonas sobre la pista: dentro del triple, fuera y desde la línea de tiros libres. */
function ShotMap({ s, label }: { s: StatBlock; label: string }) {
  const z = (m: number, a: number) => (a ? m / a : 0)
  const spots: [number, number, string, number | null, number, number][] = [
    [50, 33, 'Tiros de 2', s.fg2_pct, s.fg2m, s.fg2a],
    [50, 52, 'Tiros libres', s.ft_pct, s.ftm, s.fta],
    [50, 80, 'Triples', s.fg3_pct, s.fg3m, s.fg3a]
  ]
  return (
    <HalfCourt label={label} zones={{ two: z(s.fg2m, s.fg2a), three: z(s.fg3m, s.fg3a) }}>
      {spots.map(([x, y, k, v, m, a]) => (
        <div key={k} className="court-shot" style={{ left: `${x}%`, top: `${y}%` }}>
          <b>{a ? pctTxt(v) : '—'}</b>
          <span>
            {k} · {m}/{a}
          </span>
        </div>
      ))}
    </HalfCourt>
  )
}

/** De dónde salen sus puntos: tiros de 2, triples y tiros libres. */
function PointsMix({ s }: { s: StatBlock }) {
  const parts = [
    { k: 'Tiros de 2', v: s.fg2m * 2, c: 'var(--brand)' },
    { k: 'Triples', v: s.fg3m * 3, c: 'var(--marker)' },
    { k: 'Tiros libres', v: s.ftm, c: 'var(--win)' }
  ]
  const total = parts.reduce((a, p) => a + p.v, 0) || 1
  return (
    <Section title="De dónde salen sus puntos" eyebrow={`${s.pts} puntos en ${s.games} partidos`}>
      <div className="mix-bar">
        {parts.map((p) => (
          <span key={p.k} style={{ width: `${(100 * p.v) / total}%`, background: p.c }} title={`${p.k}: ${p.v}`} />
        ))}
      </div>
      <div className="mix-rows">
        {parts.map((p) => (
          <div key={p.k}>
            <i style={{ background: p.c }} />
            <span>{p.k}</span>
            <b>{p.v}</b>
            <em>{Math.round((100 * p.v) / total)}%</em>
          </div>
        ))}
      </div>
      <div className="mix-rows" style={{ marginTop: 14 }}>
        <div>
          <i style={{ background: 'var(--court)' }} />
          <span>True shooting</span>
          <b>{pctTxt(s.ts_pct)}</b>
          <em>eFG {pctTxt(s.efg_pct)}</em>
        </div>
        <div>
          <i style={{ background: 'var(--court)' }} />
          <span>Faltas recibidas</span>
          <b>{s.fd}</b>
          <em>{s.games ? num(s.fd / s.games) : '—'} por partido</em>
        </div>
        <div>
          <i style={{ background: 'var(--court)' }} />
          <span>Mates</span>
          <b>{s.dunks}</b>
          <em>{s.games ? num(s.dunks / s.games) : '—'} por partido</em>
        </div>
      </div>
    </Section>
  )
}

function PlayerSummary({ data }: { data: PlayerData }) {
  const { season, career } = data
  const acb = career?.acbTotals
  const entries = buildCareer(data)
  const p = data.player
  return (
    <div className="stack">
      {season && (
        <Section
          title={`Temporada ${data.current?.season_label ?? ''}`}
          eyebrow={`Por partido · ${data.current?.competition_name ?? ''}`}
          actions={<a className="link" href={href.player(p.ref, p.display_name, 'estadisticas')}>Todas las estadísticas →</a>}
        >
          <StatSheet s={season} ranks={data.ranks} league={data.current?.competition_name} />
        </Section>
      )}
      {season && season.fg2a + season.fg3a + season.fta > 0 && (
        <div className="board">
          <ShotMap s={season} label={`Mapa de tiro · ${data.current?.season_label ?? ''}`} />
          <PointsMix s={season} />
        </div>
      )}

      {entries.length > 0 && (
        <Section
          title="Trayectoria"
          eyebrow="Carrera temporada a temporada"
          actions={<a className="link" href={href.player(p.ref, p.display_name, 'trayectoria')}>Trayectoria completa →</a>}
        >
          <CareerHeader data={data} />
          <CareerChart rows={data.trajectory} />
          <div className="mt">
            <CareerTimeline entries={entries} limit={6} />
          </div>
        </Section>
      )}

      <div className="grid grid-main">
        <div className="stack">
          {acb && (
            <Section title="Carrera en la Liga Endesa" eyebrow="Totales oficiales ACB">
              <div className="stat-tiles">
                <StatTile label="Partidos" value={int(acb.games)} sub={acb.starts != null ? `${int(acb.starts)} de titular` : undefined} />
                <StatTile label="Puntos" value={int(acb.points)} sub={career?.acbAverages ? `${num(career.acbAverages.points)} por partido` : undefined} />
                <StatTile label="Rebotes" value={int(acb.reb)} sub={career?.acbAverages ? `${num(career.acbAverages.reb)} por partido` : undefined} />
                <StatTile label="Asistencias" value={int(acb.ast)} sub={career?.acbAverages ? `${num(career.acbAverages.ast)} por partido` : undefined} />
                <StatTile label="Triples" value={int(acb.fg3m)} sub={`${pct(acb.fg3a ? (100 * acb.fg3m) / acb.fg3a : null)} de acierto`} />
                <StatTile label="Valoración" value={int(acb.pir)} sub={career?.acbAverages ? `${num(career.acbAverages.pir)} por partido` : undefined} />
              </div>
            </Section>
          )}
          {data.gameLog.length > 0 && (
            <Section title="Últimos partidos" actions={<a className="link" href={href.player(p.ref, p.display_name, 'partidos')}>Todos →</a>}>
              <GameLogTable rows={data.gameLog.slice(0, 5)} compact />
            </Section>
          )}
        </div>
        <Records data={data} />
      </div>
    </div>
  )
}

const RECORD_LABELS: Record<string, string> = {
  rating: 'Valoración',
  points: 'Puntos',
  rebounds: 'Rebotes',
  offensiveRebounds: 'Rebotes ofensivos',
  defensiveRebounds: 'Rebotes defensivos',
  assists: 'Asistencias',
  steals: 'Robos',
  blocks: 'Tapones',
  threePointersMade: 'Triples',
  twoPointersMade: 'Tiros de 2',
  freeThrowsMade: 'Tiros libres',
  dunks: 'Mates',
  foulsReceived: 'Faltas recibidas',
  plusMinus: '+/−'
}

function Records({ data }: { data: PlayerData }) {
  const recs = Object.entries(data.career?.records ?? {}).filter(([k, r]) => RECORD_LABELS[k] && r.value > 0)
  if (!recs.length) return null
  return (
    <Section title="Récords personales" eyebrow="Mejor partido en la Liga Endesa">
      <table className="table compact">
        <tbody>
          {recs.map(([k, r]) => (
            <tr key={k}>
              <td className="muted">{RECORD_LABELS[k]}</td>
              <td className="num" style={{ fontWeight: 800, fontSize: 15 }}>
                {r.value}
              </td>
              <td className="small muted" style={{ whiteSpace: 'normal' }}>
                {r.home && r.away ? `${r.home} – ${r.away}` : ''}
                {r.date ? ` · ${fmtDate(r.date)}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function PlayerStats({ data }: { data: PlayerData }) {
  const s = data.season
  const c = data.career
  if (!s && !c && !data.trajectory.length) return <Empty>Sin estadísticas registradas.</Empty>
  const seasonName = `Temporada ${data.current?.season_label ?? ''}`
  return (
    <div className="stack">
      {s && (
        <Section title={seasonName} eyebrow={data.current?.competition_name}>
          <FullStatsTable
            rows={[seasonLine('Por partido', s, 'avg'), seasonLine('Totales', s, 'tot'), seasonLine('Por 40 minutos', s, 'p40')]}
          />
        </Section>
      )}
      {c && (c.acbAverages || c.acbTotals) && (
        <Section title="Carrera oficial en la ACB" eyebrow="acb.com">
          <FullStatsTable
            rows={[
              ...(c.acbAverages ? [careerLine('Liga Endesa · por partido', c.acbAverages, true)] : []),
              ...(c.acbTotals ? [careerLine('Liga Endesa · totales', c.acbTotals, false)] : []),
              ...(c.allAverages ? [careerLine('Todas las competiciones · por partido', c.allAverages, true)] : []),
              ...(c.allTotals ? [careerLine('Todas las competiciones · totales', c.allTotals, false)] : [])
            ]}
          />
          <p className="note">“Todas las competiciones” incluye Liga Endesa, Copa del Rey y Supercopa.</p>
        </Section>
      )}
      {data.trajectory.length > 0 && (
        <Section title="Por temporada" eyebrow="Promedios por partido">
          <FullStatsTable
            rows={data.trajectory.map((t) =>
              seasonLine(
                <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  {t.label}
                  <TeamLogo src={t.logo} name={t.team_name} size={18} />
                  <span className="muted" style={{ fontWeight: 500 }}>
                    {t.team_name}
                  </span>
                </span>,
                { ...t, starts: 0, player_id: 0, player_ref: '', display_name: '', photo: null, photo_nobg: null, position: null, nationality: null, team: {} as never } as never,
                'avg'
              )
            )}
          />
        </Section>
      )}
      {s && (
        <Section title="Tiro y eficiencia" eyebrow={seasonName}>
          <div className="stat-tiles">
            <StatTile label="T2%" value={pct(s.fg2_pct)} sub={shot(s.fg2m, s.fg2a)} />
            <StatTile label="T3%" value={pct(s.fg3_pct)} sub={shot(s.fg3m, s.fg3a)} />
            <StatTile label="TL%" value={pct(s.ft_pct)} sub={shot(s.ftm, s.fta)} />
            <StatTile label="TC%" value={pct(s.fg_pct)} />
            <StatTile label="TS%" value={pct(s.ts_pct)} sub="True Shooting" />
            <StatTile label="eFG%" value={pct(s.efg_pct)} sub="Tiro efectivo" />
            <StatTile label="+/−" value={signed(s.pm)} sub={`${num(s.pmpg)} por partido`} />
            <StatTile label="Mates" value={int(s.dunks)} />
            <StatTile label="Faltas recibidas" value={int(s.fd)} />
          </div>
        </Section>
      )}
    </div>
  )
}

function TrajectoryTable({ rows, mode }: { rows: TrajectoryRow[]; mode: StatMode }) {
  const v = (avg: number, tot: number) => (mode === 'avg' ? num(avg) : int(tot))
  const columns: Column<TrajectoryRow>[] = [
    { key: 'start_year', label: 'Temporada', value: (r) => r.start_year, render: (r) => <b>{r.label}</b> },
    {
      key: 'team_name',
      label: 'Equipo',
      render: (r) =>
        r.club_ref ? (
          <a className="team-link" href={href.club(r.club_ref, r.team_name, undefined, r.start_year)}>
            <TeamLogo src={r.logo} name={r.team_name} size={22} />
            <span>{r.team_name}</span>
          </a>
        ) : (
          r.team_name
        )
    },
    { key: 'competition_code', label: 'Liga', render: (r) => <CompetitionBadge name={r.competition_code} /> },
    { key: 'games', label: 'PJ', num: true, render: (r) => `${r.games}${r.playoff_games ? ` (${r.playoff_games} PO)` : ''}` },
    { key: 'mpg', label: 'MIN', num: true, render: (r) => v(r.mpg, r.seconds / 60) },
    { key: 'ppg', label: 'PTS', num: true, render: (r) => <b>{v(r.ppg, r.pts)}</b> },
    { key: 'rpg', label: 'REB', num: true, render: (r) => v(r.rpg, r.reb) },
    { key: 'orpg', label: 'RO', num: true, render: (r) => v(r.orpg, r.oreb) },
    { key: 'drpg', label: 'RD', num: true, render: (r) => v(r.drpg, r.dreb) },
    { key: 'apg', label: 'AST', num: true, render: (r) => v(r.apg, r.ast) },
    { key: 'spg', label: 'ROB', num: true, render: (r) => v(r.spg, r.stl) },
    { key: 'bpg', label: 'TAP', num: true, render: (r) => v(r.bpg, r.blk) },
    { key: 'tpg', label: 'PÉR', num: true, render: (r) => v(r.tpg, r.tov) },
    { key: 'pfpg', label: 'FC', num: true, render: (r) => v(r.pfpg, r.pf) },
    { key: 'pirpg', label: 'VAL', num: true, render: (r) => <b>{v(r.pirpg, r.pir)}</b> },
    { key: 'fg2_pct', label: 'T2%', num: true, render: (r) => pct(r.fg2_pct) },
    { key: 'fg3_pct', label: 'T3%', num: true, render: (r) => pct(r.fg3_pct) },
    { key: 'ft_pct', label: 'TL%', num: true, render: (r) => pct(r.ft_pct) },
    { key: 'ts_pct', label: 'TS%', num: true, render: (r) => pct(r.ts_pct) }
  ]
  const tot = rows.reduce(
    (a, r) => ({
      games: a.games + r.games,
      seconds: a.seconds + r.seconds,
      pts: a.pts + r.pts,
      reb: a.reb + r.reb,
      ast: a.ast + r.ast,
      stl: a.stl + r.stl,
      blk: a.blk + r.blk,
      pir: a.pir + r.pir
    }),
    { games: 0, seconds: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, pir: 0 }
  )
  const g = tot.games || 1
  const foot = (
    <tfoot>
      <tr>
        <td>Total</td>
        <td>{rows.length} temporadas</td>
        <td />
        <td className="num">{tot.games}</td>
        <td className="num">{mode === 'avg' ? num(tot.seconds / 60 / g) : int(tot.seconds / 60)}</td>
        <td className="num">{v(tot.pts / g, tot.pts)}</td>
        <td className="num">{v(tot.reb / g, tot.reb)}</td>
        <td />
        <td />
        <td className="num">{v(tot.ast / g, tot.ast)}</td>
        <td className="num">{v(tot.stl / g, tot.stl)}</td>
        <td className="num">{v(tot.blk / g, tot.blk)}</td>
        <td />
        <td />
        <td className="num">{v(tot.pir / g, tot.pir)}</td>
        <td colSpan={4} />
      </tr>
    </tfoot>
  )
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => `${r.start_year}-${r.club_ref}-${r.team_name}-${r.competition_code}`}
      initialSort={{ key: 'start_year', dir: 'desc' }}
      footer={foot}
    />
  )
}

function Trajectory({ data }: { data: PlayerData }) {
  const [mode, setMode] = useState<StatMode>('avg')
  const entries = buildCareer(data)
  if (!entries.length) return <Empty>Sin temporadas registradas todavía.</Empty>
  return (
    <div className="stack">
      <Section title="Trayectoria completa" eyebrow="Todas las temporadas y categorías">
        <CareerHeader data={data} />
        <CareerChart rows={data.trajectory} />
        <div className="mt">
          <CareerTimeline entries={entries} />
        </div>
        <p className="note">
          Estadísticas por temporada de la Liga Endesa (acb.com) y de las competiciones FEB con estadística completa; el resto de etapas
          (categorías FEB inferiores) proceden del historial de licencias de la FEB.
        </p>
      </Section>
      {data.trajectory.length > 0 && (
        <Section title="Estadísticas por temporada" actions={<ModeToggle mode={mode} onChange={setMode} />}>
          <TrajectoryTable rows={data.trajectory} mode={mode} />
        </Section>
      )}
    </div>
  )
}

function GameLogTable({ rows, compact }: { rows: PlayerData['gameLog']; compact?: boolean }) {
  const columns: Column<PlayerData['gameLog'][number]>[] = [
    { key: 'scheduled_at', label: 'Fecha', render: (g) => fmtDay(g.scheduled_at) },
    {
      key: 'opponent',
      label: 'Rival',
      value: (g) => g.opponent.name,
      render: (g) => (
        <a className="team-link" href={href.game(g.game_ref)}>
          <span className="muted">{g.is_home ? 'vs' : '@'}</span>
          <TeamLogo src={g.opponent.logo} name={g.opponent.name} size={20} />
          <span>{g.opponent.short_name ?? g.opponent.name}</span>
        </a>
      )
    },
    {
      key: 'result',
      label: 'Res.',
      value: (g) => (g.team_score ?? 0) - (g.opp_score ?? 0),
      render: (g) => {
        const won = (g.team_score ?? 0) > (g.opp_score ?? 0)
        return (
          <span className={`chip ${won ? 'win' : 'loss'}`}>
            {won ? 'V' : 'D'} {g.team_score}-{g.opp_score}
          </span>
        )
      }
    },
    { key: 'seconds', label: 'MIN', num: true, render: (g) => <Minutes seconds={g.seconds} /> },
    { key: 'points', label: 'PTS', num: true },
    ...(compact
      ? []
      : [
          { key: 'fg2', label: 'T2', num: true, value: (g: PlayerData['gameLog'][number]) => g.fg2m, render: (g: PlayerData['gameLog'][number]) => shot(g.fg2m, g.fg2a) },
          { key: 'fg3', label: 'T3', num: true, value: (g: PlayerData['gameLog'][number]) => g.fg3m, render: (g: PlayerData['gameLog'][number]) => shot(g.fg3m, g.fg3a) },
          { key: 'ft', label: 'TL', num: true, value: (g: PlayerData['gameLog'][number]) => g.ftm, render: (g: PlayerData['gameLog'][number]) => shot(g.ftm, g.fta) }
        ]),
    { key: 'reb', label: 'REB', num: true },
    { key: 'ast', label: 'AST', num: true },
    ...(compact
      ? []
      : [
          { key: 'stl', label: 'ROB', num: true },
          { key: 'blk', label: 'TAP', num: true },
          { key: 'tov', label: 'PÉR', num: true },
          { key: 'plus_minus', label: '+/−', num: true, render: (g: PlayerData['gameLog'][number]) => signed(g.plus_minus) }
        ]),
    { key: 'pir', label: 'VAL', num: true, render: (g) => <b>{g.pir ?? '—'}</b> }
  ]
  return <DataTable rows={rows} columns={columns} rowKey={(g) => g.game_id} initialSort={{ key: 'scheduled_at', dir: 'desc' }} compact={compact} />
}

function GameLog({ data }: { data: PlayerData }) {
  return (
    <Section title="Partido a partido" eyebrow="Temporadas con estadística completa">
      {data.gameLog.length ? <GameLogTable rows={data.gameLog} /> : <Empty>Sin partidos registrados todavía.</Empty>}
    </Section>
  )
}

function PlayerReports({ data }: { data: PlayerData }) {
  const p = data.player
  return (
    <Section
      title="Informes de scouting"
      actions={
        <a className="btn" href={href.newReport(p.ref, p.display_name)}>
          + Nuevo informe
        </a>
      }
    >
      {data.reports.length === 0 ? (
        <Empty>Todavía no hay informes de este jugador.</Empty>
      ) : (
        data.reports.map((r) => <ReportCard key={r.id} r={r} />)
      )}
    </Section>
  )
}
