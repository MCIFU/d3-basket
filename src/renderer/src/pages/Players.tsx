import { useMemo, useState } from 'react'
import type { CareerLine, PlayerData, PlayerIndexRow, TrajectoryRow } from '../../../shared/api'
import {
  DataTable,
  Empty,
  ExternalLink,
  Loading,
  Minutes,
  PlayerPhoto,
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
import { href } from '../router'
import { ModeToggle, type StatMode } from './StatTables'
import { ReportCard } from './Scouting'

// ───────────────────────── Índice ─────────────────────────

export function PlayersPage() {
  const [players, error] = useLoad(() => window.d3.players(), [])
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [pos, setPos] = useState('')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const list = useMemo(
    () =>
      (players ?? []).filter(
        (p) =>
          (!q || p.display_name.toLowerCase().includes(q.toLowerCase()) || (p.nationality ?? '').toLowerCase().includes(q.toLowerCase())) &&
          (!team || p.team.club_ref === team) &&
          (!pos || p.position === pos)
      ),
    [players, q, team, pos]
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
        <div className="eyebrow">Liga Endesa</div>
        <h1>Jugadores</h1>
        <p>{players.length} jugadores con licencia en la temporada en curso.</p>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 16 }}>
          <input className="input" placeholder="Nombre o nacionalidad" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Todos los equipos</option>
            {teams.map((t) => (
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
                    <span className="rc-num">{p.jersey_number}</span>
                    {p.photo_nobg ? <img src={p.photo_nobg} alt="" loading="lazy" /> : <span className="rc-initials">{initials(p.display_name)}</span>}
                  </div>
                  <div className="rc-body">
                    <div className="rc-name">{p.display_name}</div>
                    <div className="rc-sub row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <TeamLogo src={p.team.logo} name={p.team.name} size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.team.short_name ?? p.team.name} · {p.position ?? ''}
                      </span>
                    </div>
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
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'trayectoria', label: 'Trayectoria' },
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
      <section className="hero player-hero" style={{ background: `linear-gradient(120deg, ${color} 0%, #0b1a33 80%)` }}>
        <div className="hero-grid">
          <div className="portrait">
            {p.photo_nobg || p.photo ? <img src={p.photo_nobg ?? p.photo!} alt={p.display_name} /> : <div className="ph-fallback">{initials(p.display_name)}</div>}
          </div>
          <div className="info">
            <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
              {current?.jersey_number && <span className="jersey">{current.jersey_number}</span>}
              <div>
                {current && (
                  <a className="row" style={{ gap: 8, fontWeight: 700 }} href={href.club(current.club_ref, current.name)}>
                    <span style={{ background: '#fff', borderRadius: 8, padding: 3, display: 'inline-flex' }}>
                      <TeamLogo src={current.logo} name={current.name} size={24} />
                    </span>
                    {current.name} · {current.season_label}
                    {!current.is_active && <span className="chip">Baja</span>}
                  </a>
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
      {tab === 'estadisticas' && <PlayerStats data={data} />}
      {tab === 'trayectoria' && <Trajectory data={data} />}
      {tab === 'partidos' && <GameLog data={data} />}
      {tab === 'scouting' && <PlayerReports data={data} />}
    </>
  )
}

function PlayerSummary({ data }: { data: PlayerData }) {
  const { season, career } = data
  const acb = career?.acbTotals
  return (
    <div className="grid grid-main">
      <div className="stack">
        {season && (
          <Section title={`Temporada ${data.current?.season_label ?? ''}`} eyebrow="Por partido">
            <div className="stat-tiles">
              <StatTile label="Puntos" value={num(season.ppg)} sub={`${int(season.pts)} en total`} />
              <StatTile label="Rebotes" value={num(season.rpg)} sub={`${num(season.orpg)} of. · ${num(season.drpg)} def.`} />
              <StatTile label="Asistencias" value={num(season.apg)} />
              <StatTile label="Robos" value={num(season.spg)} />
              <StatTile label="Tapones" value={num(season.bpg)} />
              <StatTile label="Valoración" value={num(season.pirpg)} />
              <StatTile label="T2%" value={pct(season.fg2_pct)} sub={shot(season.fg2m, season.fg2a)} />
              <StatTile label="T3%" value={pct(season.fg3_pct)} sub={shot(season.fg3m, season.fg3a)} />
              <StatTile label="TL%" value={pct(season.ft_pct)} sub={shot(season.ftm, season.fta)} />
              <StatTile label="TS%" value={pct(season.ts_pct)} />
            </div>
          </Section>
        )}
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
        {data.trajectory.length > 0 && (
          <Section title="Trayectoria" actions={<a className="link" href={href.player(data.player.ref, data.player.display_name, 'trayectoria')}>Completa →</a>}>
            <TrajectoryTable rows={data.trajectory.slice(0, 6)} mode="avg" compact />
          </Section>
        )}
      </div>
      <div className="stack">
        <Records data={data} />
        {data.gameLog.length > 0 && (
          <Section title="Últimos partidos" actions={<a className="link" href={href.player(data.player.ref, data.player.display_name, 'partidos')}>Todos →</a>}>
            <GameLogTable rows={data.gameLog.slice(0, 5)} compact />
          </Section>
        )}
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

function careerRow(label: string, l?: CareerLine, avg?: boolean) {
  if (!l) return null
  const f = (v: number) => (avg ? num(v) : int(v))
  return (
    <tr key={label}>
      <td>
        <b>{label}</b>
      </td>
      <td className="num">{int(l.games)}</td>
      <td className="num">{avg ? num(l.seconds / 60) : int(l.seconds / 60)}</td>
      <td className="num">{f(l.points)}</td>
      <td className="num">{f(l.reb)}</td>
      <td className="num">{f(l.oreb)}</td>
      <td className="num">{f(l.dreb)}</td>
      <td className="num">{f(l.ast)}</td>
      <td className="num">{f(l.stl)}</td>
      <td className="num">{f(l.blk)}</td>
      <td className="num">{f(l.tov)}</td>
      <td className="num">{f(l.pf)}</td>
      <td className="num">{f(l.pir)}</td>
      <td className="num">{avg ? `${num(l.fg2m)}/${num(l.fg2a)}` : shot(l.fg2m, l.fg2a)}</td>
      <td className="num">{avg ? `${num(l.fg3m)}/${num(l.fg3a)}` : shot(l.fg3m, l.fg3a)}</td>
      <td className="num">{avg ? `${num(l.ftm)}/${num(l.fta)}` : shot(l.ftm, l.fta)}</td>
    </tr>
  )
}

function PlayerStats({ data }: { data: PlayerData }) {
  const s = data.season
  const c = data.career
  const seasonLine = (avg: boolean): CareerLine | undefined =>
    s && {
      games: s.games,
      seconds: avg ? s.seconds / (s.games || 1) : s.seconds,
      points: avg ? s.ppg : s.pts,
      reb: avg ? s.rpg : s.reb,
      oreb: avg ? s.orpg : s.oreb,
      dreb: avg ? s.drpg : s.dreb,
      ast: avg ? s.apg : s.ast,
      stl: avg ? s.spg : s.stl,
      blk: avg ? s.bpg : s.blk,
      tov: avg ? s.tpg : s.tov,
      pf: avg ? s.pfpg : s.pf,
      pir: avg ? s.pirpg : s.pir,
      fg2m: avg ? s.fg2m / (s.games || 1) : s.fg2m,
      fg2a: avg ? s.fg2a / (s.games || 1) : s.fg2a,
      fg3m: avg ? s.fg3m / (s.games || 1) : s.fg3m,
      fg3a: avg ? s.fg3a / (s.games || 1) : s.fg3a,
      ftm: avg ? s.ftm / (s.games || 1) : s.ftm,
      fta: avg ? s.fta / (s.games || 1) : s.fta,
      dunks: s.dunks,
      foulsDrawn: s.fd,
      plusMinus: s.pm
    }
  const head = (
    <thead>
      <tr>
        <th />
        {['PJ', 'MIN', 'PTS', 'REB', 'RO', 'RD', 'AST', 'ROB', 'TAP', 'PÉR', 'FP', 'VAL', 'T2', 'T3', 'TL'].map((h) => (
          <th key={h} className="num">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  )
  if (!s && !c) return <Empty>Sin estadísticas registradas.</Empty>
  return (
    <div className="stack">
      <Section title="Promedios por partido">
        <div className="table-wrap">
          <table className="table">
            {head}
            <tbody>
              {careerRow(`Temporada ${data.current?.season_label ?? ''}`, seasonLine(true), true)}
              {careerRow('Carrera Liga Endesa', c?.acbAverages, true)}
              {careerRow('Todas las competiciones ACB', c?.allAverages, true)}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Totales">
        <div className="table-wrap">
          <table className="table">
            {head}
            <tbody>
              {careerRow(`Temporada ${data.current?.season_label ?? ''}`, seasonLine(false))}
              {careerRow('Carrera Liga Endesa', c?.acbTotals)}
              {careerRow('Todas las competiciones ACB', c?.allTotals)}
            </tbody>
          </table>
        </div>
        <p className="note">“Todas las competiciones ACB” incluye Liga Endesa, Copa del Rey y Supercopa. Fuente: acb.com.</p>
      </Section>
      {s && (
        <Section title="Tiro y eficiencia" eyebrow={`Temporada ${data.current?.season_label ?? ''}`}>
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

function TrajectoryTable({ rows, mode, compact }: { rows: TrajectoryRow[]; mode: StatMode; compact?: boolean }) {
  const v = (avg: number, tot: number) => (mode === 'avg' ? num(avg) : int(tot))
  const columns: Column<TrajectoryRow>[] = [
    { key: 'start_year', label: 'Temporada', num: false, value: (r) => r.start_year, render: (r) => <b>{r.label}</b> },
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
    { key: 'games', label: 'PJ', num: true, render: (r) => `${r.games}${r.playoff_games ? ` (${r.playoff_games} PO)` : ''}` },
    { key: 'mpg', label: 'MIN', num: true, render: (r) => v(r.mpg, r.seconds / 60) },
    { key: 'ppg', label: 'PTS', num: true, render: (r) => v(r.ppg, r.pts) },
    { key: 'rpg', label: 'REB', num: true, render: (r) => v(r.rpg, r.reb) },
    { key: 'apg', label: 'AST', num: true, render: (r) => v(r.apg, r.ast) },
    { key: 'spg', label: 'ROB', num: true, render: (r) => v(r.spg, r.stl) },
    { key: 'bpg', label: 'TAP', num: true, render: (r) => v(r.bpg, r.blk) },
    { key: 'pirpg', label: 'VAL', num: true, render: (r) => v(r.pirpg, r.pir) },
    ...(compact
      ? []
      : [
          { key: 'fg2_pct', label: 'T2%', num: true, render: (r: TrajectoryRow) => pct(r.fg2_pct) },
          { key: 'fg3_pct', label: 'T3%', num: true, render: (r: TrajectoryRow) => pct(r.fg3_pct) },
          { key: 'ft_pct', label: 'TL%', num: true, render: (r: TrajectoryRow) => pct(r.ft_pct) },
          { key: 'ts_pct', label: 'TS%', num: true, render: (r: TrajectoryRow) => pct(r.ts_pct) }
        ])
  ]
  return <DataTable rows={rows} columns={columns} rowKey={(r) => `${r.start_year}-${r.club_ref}-${r.team_name}`} initialSort={{ key: 'start_year', dir: 'desc' }} compact={compact} />
}

function Trajectory({ data }: { data: PlayerData }) {
  const [mode, setMode] = useState<StatMode>('avg')
  const clubs = [...new Map(data.trajectory.map((t) => [t.club_ref ?? t.team_name, t])).values()]
  const seasons = new Set(data.trajectory.map((t) => t.start_year)).size
  const acbEditions = data.career?.acbTotals?.games
  return (
    <div className="stack">
      <Section
        title="Trayectoria temporada a temporada"
        eyebrow="Liga Endesa"
        actions={<ModeToggle mode={mode} onChange={setMode} />}
      >
        {data.trajectory.length ? <TrajectoryTable rows={data.trajectory} mode={mode} /> : <Empty>Sin temporadas registradas.</Empty>}
        <p className="note">
          {seasons} temporadas y {clubs.length} clubes registrados
          {acbEditions ? ` · ${int(acbEditions)} partidos oficiales en su carrera ACB` : ''}. Las temporadas pasadas se completan
          poco a poco con cada actualización de datos desde acb.com.
        </p>
      </Section>
      {clubs.length > 0 && (
        <Section title="Clubes">
          <div className="club-tiles">
            {clubs.map((c) => {
              const stints = data.trajectory.filter((t) => (t.club_ref ?? t.team_name) === (c.club_ref ?? c.team_name))
              const years = stints.map((s) => s.start_year)
              const games = stints.reduce((a, s) => a + s.games, 0)
              const body = (
                <>
                  <TeamLogo src={c.logo} name={c.team_name} size={44} />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{c.team_name}</div>
                    <div className="sub">
                      {Math.min(...years)}–{Math.max(...years) + 1} · {stints.length} temp. · {games} partidos
                    </div>
                  </div>
                </>
              )
              return c.club_ref ? (
                <a key={c.club_ref} className="club-tile" href={href.club(c.club_ref, c.team_name)}>
                  {body}
                </a>
              ) : (
                <div key={c.team_name} className="club-tile">
                  {body}
                </div>
              )
            })}
          </div>
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
