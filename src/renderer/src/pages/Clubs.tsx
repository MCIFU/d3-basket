import { useState } from 'react'
import type { ClubData, ClubHonour } from '../../../shared/api'
import {
  CardPhoto,
  DataTable,
  Empty,
  ExternalLink,
  GameCard,
  Loading,
  PlayerPhoto,
  Section,
  Segmented,
  StatTile,
  TROPHIES,
  Tabs,
  TeamLogo,
  Trophy,
  useLoad,
  type Column
} from '../components'
import { LICENSE_LABEL, age, int, luminance, mix, num, pct, teamColor } from '../format'
import { brandVars, leagueTheme } from '../leagues'
import { href, navigate } from '../router'
import { PlayerStatsTable } from './StatTables'

export function ClubsPage() {
  const [clubs, error] = useLoad(() => window.d3.clubs(), [])
  if (!clubs) return <Loading error={error} />
  const leagues = [...new Map(clubs.map((c) => [c.competition_code, c.competition_name])).entries()]
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Temporada en curso</div>
        <h1>Equipos</h1>
        <p>{clubs.length} clubes. Cada ficha incluye plantilla con fotos, estadísticas con su puesto en la liga, partidos, pabellón, historia y palmarés.</p>
      </div>
      <div className="stack">
        {leagues.map(([code, name]) => {
          const list = clubs.filter((c) => c.competition_code === code)
          const groups = [...new Set(list.map((c) => c.group ?? ''))]
          const theme = leagueTheme(code)
          return (
            <div key={code} style={theme ? brandVars(theme.color, theme.color2) : undefined}>
              <Section title={name} eyebrow={`${list.length} equipos${groups.length > 1 ? ` · ${groups.length} grupos` : ''}`} actions={<a className="link" href={href.league(code)}>Ver liga →</a>} className="league-section">
                {groups.map((g) => (
                  <div key={g} className="club-group">
                    {groups.length > 1 && <div className="eyebrow">Grupo {g}</div>}
                    <div className="club-tiles">
                      {list
                        .filter((c) => (c.group ?? '') === g)
                        .map((c) => (
                          <a key={c.team_id} className="club-tile" href={href.club(c.club_ref, c.name)} style={{ ['--c' as string]: teamColor(c.color) }}>
                            <TeamLogo src={c.logo} name={c.name} size={52} />
                            <div style={{ minWidth: 0 }}>
                              <div className="name">{c.name}</div>
                              <div className="sub">{c.arena ?? ''}</div>
                              {c.founded_year && <div className="sub">Fundado en {c.founded_year}</div>}
                            </div>
                          </a>
                        ))}
                    </div>
                  </div>
                ))}
              </Section>
            </div>
          )
        })}
      </div>
    </>
  )
}

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'plantilla', label: 'Plantilla' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'partidos', label: 'Partidos' },
  { id: 'palmares', label: 'Palmarés' },
  { id: 'historia', label: 'Historia' }
]

export function ClubPage({ refId, tab = 'resumen', year }: { refId: string; tab?: string; year?: number }) {
  const [data, error] = useLoad(() => window.d3.club(refId, year), [refId, year])
  if (error) return <Loading error={error} />
  if (data === undefined) return <Loading />
  if (!data) return <Empty>No se ha encontrado este equipo.</Empty>
  const { club, stats, standing, season } = data
  const color = teamColor(club.color, '#13294d')
  const titles = (c: ClubHonour['competition']) => data.honours.filter((h) => h.competition === c && h.role === 'champion').length
  // Colores del club: el principal tiñe la cabecera y los acentos de la página (oscurecido si es muy
  // claro para que se lea sobre blanco); el secundario, la franja diagonal de la cabecera.
  const accent = luminance(color) > 0.62 ? mix(color, '#000000', 0.45) : color
  const second = club.color2 && /^#[0-9a-f]{6}$/i.test(club.color2) ? club.color2 : '#ffffff'

  return (
    <div style={brandVars(accent, second)}>
      <section
        className="hero team-hero"
        style={{ background: `linear-gradient(120deg, ${color} 0%, ${mix(color, '#000000', 0.55)} 62%, ${mix(color, '#000000', 0.75)} 100%)` }}
      >
        <span className="team-stripe" style={{ background: second }} />
        <span className="team-stripe thin" style={{ background: second }} />
        <div className="hero-grid">
          <div className="hero-logo">
            <TeamLogo src={club.logo} name={club.name} size={88} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{data.team ? `${data.competition?.name ?? ''} ${season?.label ?? ''}` : 'Club histórico'}</div>
            <h1>{data.team?.name ?? club.name}</h1>
            <div className="hero-facts">
              {club.founded_year && (
                <div className="hero-fact">
                  <div className="k">Fundación</div>
                  <div className="v">{club.founded_year}</div>
                </div>
              )}
              {club.arena && (
                <div className="hero-fact">
                  <div className="k">Pabellón</div>
                  <div className="v">
                    {club.arena}
                    {club.arena_capacity ? ` · ${int(club.arena_capacity)} esp.` : ''}
                  </div>
                </div>
              )}
              {data.staff.find((s) => s.role === 'head_coach') && (
                <div className="hero-fact">
                  <div className="k">Entrenador</div>
                  <div className="v">{data.staff.find((s) => s.role === 'head_coach')!.name}</div>
                </div>
              )}
              {(['liga', 'copa', 'supercopa'] as const).some((c) => titles(c)) && (
                <div className="hero-fact">
                  <div className="k">Palmarés</div>
                  <div className="v">
                    {(['liga', 'copa', 'supercopa'] as const)
                      .filter((c) => titles(c))
                      .map((c) => `${titles(c)} ${c === 'liga' ? 'Ligas' : c === 'copa' ? 'Copas' : 'Supercopas'}`)
                      .join(' · ')}
                  </div>
                </div>
              )}
            </div>
            <div className="hero-actions">
              {data.seasons.length > 1 && (
                <select className="select" value={season?.start_year} onChange={(e) => navigate(href.club(refId, club.name, tab, Number(e.target.value)))}>
                  {data.seasons.map((s) => (
                    <option key={s.team_id} value={s.start_year}>
                      Temporada {s.label}
                    </option>
                  ))}
                </select>
              )}
              {club.website && (
                <ExternalLink url={/^https?:/.test(club.website) ? club.website : `https://${club.website}`}>
                  <span className="btn btn-light">Web oficial ↗</span>
                </ExternalLink>
              )}
              {Object.entries(club.socials)
                .filter(([k]) => ['instagram', 'twitter', 'youtube', 'tiktok', 'facebook'].includes(k))
                .map(([k, url]) => (
                  <ExternalLink key={k} url={url}>
                    <span className="btn btn-light">{k === 'twitter' ? 'X' : k[0].toUpperCase() + k.slice(1)}</span>
                  </ExternalLink>
                ))}
            </div>
          </div>
          {stats && (
            <div className="hero-side">
              <div className="stat-tiles">
                <StatTile label="Clasificación" value={standing ? `${standing.position}º` : '—'} sub={`${stats.wins}V · ${stats.losses}D`} />
                <StatTile label="Puntos / partido" value={num(stats.ppg)} sub={`Reciben ${num(stats.opp_ppg)}`} />
                <StatTile label="Valoración / partido" value={num(stats.pirpg)} />
                <StatTile label="Espectadores (media)" value={int(stats.attendance_avg)} />
              </div>
            </div>
          )}
        </div>
      </section>

      <Tabs active={tab} items={TABS.map((t) => ({ ...t, href: href.club(refId, club.name, t.id, year) }))} />

      {tab === 'resumen' && <ClubSummary data={data} />}
      {tab === 'plantilla' && <Roster data={data} />}
      {tab === 'estadisticas' && <ClubStats data={data} />}
      {tab === 'partidos' && (
        <Section title="Partidos" eyebrow={season?.label}>
          {data.games.length ? (
            <div className="games-grid">
              {data.games.map((g) => (
                <GameCard key={g.id} g={g} />
              ))}
            </div>
          ) : (
            <Empty>Sin partidos en esta temporada.</Empty>
          )}
        </Section>
      )}
      {tab === 'palmares' && <Cabinet data={data} />}
      {tab === 'historia' && <History data={data} />}
    </div>
  )
}

const LEADER_CATS = [
  { k: 'pirpg', label: 'Valoración' },
  { k: 'ppg', label: 'Puntos' },
  { k: 'rpg', label: 'Rebotes' },
  { k: 'apg', label: 'Asistencias' }
] as const

function TeamLeaders({ data }: { data: ClubData }) {
  const color = teamColor(data.club.color, '#13294d')
  const cards = LEADER_CATS.flatMap((c) => (data.leaders[c.k] ? [{ ...c, l: data.leaders[c.k]! }] : []))
  if (!cards.length) return null
  return (
    <div className="leader-cards">
      {cards.map(({ k, label, l }) => (
        <a key={k} className="leader-card" href={href.player(l.player_ref, l.display_name)}>
          <div className="lc-top" style={{ background: `linear-gradient(160deg, ${color}, ${color}bb)` }}>
            <span className="lc-cat">{label}</span>
            <span className="lc-val">{num(l.value)}</span>
            <CardPhoto src={l.photo_nobg} name={l.display_name} />
          </div>
          <div className="lc-body">
            <div style={{ fontWeight: 700 }}>{l.display_name}</div>
            <div className="small muted">
              {label} por partido · {l.games} PJ
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}

export function RankTile({ label, value, rank, of, sub }: { label: string; value: string; rank?: number; of: number; sub?: string }) {
  const cls = rank == null ? '' : rank <= 3 ? 'top' : rank > of - 3 ? 'bottom' : ''
  return (
    <StatTile
      label={label}
      value={value}
      sub={
        <>
          {rank != null && (
            <span className={`rank-badge ${cls}`} style={{ marginLeft: 0 }}>
              {rank}º de {of}
            </span>
          )}{' '}
          {sub}
        </>
      }
    />
  )
}

function Performance({ data }: { data: ClubData }) {
  const s = data.stats
  if (!s) return null
  const r = data.ranks
  const n = data.teamsInLeague
  const home = data.games.filter((g) => g.status === 'finished' && g.home.team_id === data.team?.team_id)
  const away = data.games.filter((g) => g.status === 'finished' && g.away.team_id === data.team?.team_id)
  const wins = (list: typeof home, isHome: boolean) =>
    list.filter((g) => (isHome ? g.home_score! > g.away_score! : g.away_score! > g.home_score!)).length
  return (
    <Section title="Rendimiento de la temporada" eyebrow={`${data.season?.label} · puesto entre los ${n} equipos de la liga`}>
      <div className="stat-tiles">
        <RankTile label="Puntos" value={num(s.ppg)} rank={r.ppg} of={n} />
        <RankTile label="Recibidos" value={num(s.opp_ppg)} rank={r.opp_ppg} of={n} />
        <RankTile label="Diferencia" value={num(s.diff_pg)} rank={r.diff_pg} of={n} />
        <RankTile label="Rebotes" value={num(s.rpg)} rank={r.rpg} of={n} />
        <RankTile label="Asistencias" value={num(s.apg)} rank={r.apg} of={n} />
        <RankTile label="Robos" value={num(s.spg)} rank={r.spg} of={n} />
        <RankTile label="Tapones" value={num(s.bpg)} rank={r.bpg} of={n} />
        <RankTile label="Pérdidas" value={num(s.tpg)} rank={r.tpg} of={n} />
        <RankTile label="Valoración" value={num(s.pirpg)} rank={r.pirpg} of={n} />
        <RankTile label="T3%" value={pct(s.fg3_pct)} rank={r.fg3_pct} of={n} />
        <RankTile label="TS%" value={pct(s.ts_pct)} rank={r.ts_pct} of={n} />
        <RankTile label="Público" value={int(s.attendance_avg)} rank={s.attendance_avg != null ? r.attendance_avg : undefined} of={n} />
      </div>
      <div className="row mt">
        <span className="chip win">
          Balance {s.wins}-{s.losses}
        </span>
        <span className="chip">
          En casa {wins(home, true)}-{home.length - wins(home, true)}
        </span>
        <span className="chip">
          Fuera {wins(away, false)}-{away.length - wins(away, false)}
        </span>
        {data.standing && <span className="chip brand">{data.standing.position}º en la clasificación</span>}
      </div>
    </Section>
  )
}

function RecentResults({ data }: { data: ClubData }) {
  const tid = data.team?.team_id
  const played = data.games.filter((g) => g.status === 'finished').slice(-6).reverse()
  const next = data.games.filter((g) => g.status !== 'finished').slice(0, 3)
  if (!played.length && !next.length) return null
  return (
    <Section title="Resultados y próximos partidos" actions={<a className="link" href={href.club(data.club.ref, data.club.name, 'partidos', data.season?.start_year)}>Calendario →</a>}>
      {played.length > 0 && (
        <div className="results-strip">
          {played.map((g) => {
            const isHome = g.home.team_id === tid
            const opp = isHome ? g.away : g.home
            const mine = isHome ? g.home_score! : g.away_score!
            const theirs = isHome ? g.away_score! : g.home_score!
            const won = mine > theirs
            return (
              <a key={g.id} className="result-chip" href={g.has_boxscore ? href.game(g.ref) : href.club(opp.club_ref, opp.name)}>
                <span className={`wl ${won ? 'w' : 'l'}`}>{won ? 'V' : 'D'}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="score">
                    {mine}-{theirs}
                  </div>
                  <div className="opp">
                    {isHome ? 'vs' : '@'} {opp.short_name ?? opp.name}
                  </div>
                </span>
              </a>
            )
          })}
        </div>
      )}
      {next.length > 0 && (
        <div className="games-grid mt">
          {next.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </Section>
  )
}

function ClubSummary({ data }: { data: ClubData }) {
  const { club } = data
  return (
    <div className="stack">
      <Performance data={data} />
      {data.stats && (
        <div>
          <div className="card-head">
            <div>
              <div className="eyebrow">Líderes del equipo</div>
              <h2>Los mejores por partido</h2>
            </div>
            <a className="link" href={href.club(club.ref, club.name, 'plantilla', data.season?.start_year)}>
              Plantilla completa →
            </a>
          </div>
          <TeamLeaders data={data} />
        </div>
      )}
      <div className="grid grid-main">
        <div className="stack">
          <RecentResults data={data} />
          {club.history && (
            <Section title="Historia" eyebrow="El club">
              <p className="history-text">{club.history}</p>
              <p className="note">
                Fuente: {club.history_url ? <ExternalLink url={club.history_url}>Wikipedia</ExternalLink> : 'Wikipedia'} (CC BY-SA 4.0).
              </p>
            </Section>
          )}
        </div>
        <div className="stack">
          <CabinetMini data={data} />
          <Section title="Pabellón">
            {club.arena_photo_url && <img className="arena-photo" src={club.arena_photo_url} alt={club.arena ?? ''} loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <dl className="kv">
              <dt>Nombre</dt>
              <dd>{club.arena ?? '—'}</dd>
              {club.arena_capacity ? (
                <>
                  <dt>Aforo</dt>
                  <dd>{int(club.arena_capacity)} espectadores</dd>
                </>
              ) : null}
              {club.arena_address && (
                <>
                  <dt>Dirección</dt>
                  <dd>{club.arena_address}</dd>
                </>
              )}
              {data.stats?.attendance_avg != null && (
                <>
                  <dt>Asistencia media</dt>
                  <dd>
                    {int(data.stats.attendance_avg)}
                    {club.arena_capacity ? ` (${pct((100 * data.stats.attendance_avg) / club.arena_capacity)} de ocupación)` : ''}
                  </dd>
                </>
              )}
            </dl>
          </Section>
          {data.staff.length > 0 && (
            <Section title="Cuerpo técnico">
              <dl className="kv">
                {data.staff.map((st) => (
                  <div key={st.name + st.role} style={{ display: 'contents' }}>
                    <dt>{st.role === 'head_coach' ? 'Entrenador' : 'Ayudante'}</dt>
                    <dd>{st.name}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Roster({ data }: { data: ClubData }) {
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const color = teamColor(data.club.color, '#13294d')
  if (!data.roster.length) return <Empty>Sin plantilla registrada para esta temporada.</Empty>
  const columns: Column<ClubData['roster'][number]>[] = [
    { key: 'jersey_number', label: '#', num: true, value: (r) => Number(r.jersey_number) },
    {
      key: 'display_name',
      label: 'Jugador',
      render: (r) => (
        <a className="player-cell" href={href.player(r.player_ref, r.display_name)}>
          <PlayerPhoto nobg={r.photo_nobg} photo={r.photo} name={r.display_name} color={data.club.color} size={34} />
          <span className="name">{r.display_name}</span>
          {!r.is_active && <span className="chip loss">Baja</span>}
        </a>
      )
    },
    { key: 'position', label: 'Posición' },
    { key: 'nationality', label: 'Nacionalidad' },
    { key: 'age', label: 'Edad', num: true, value: (r) => age(r.birth_date), render: (r) => age(r.birth_date) ?? '—' },
    { key: 'height_cm', label: 'Altura', num: true, render: (r) => (r.height_cm ? `${r.height_cm} cm` : '—') },
    { key: 'license_type', label: 'Licencia', render: (r) => <span title={LICENSE_LABEL[r.license_type ?? '']}>{r.license_type ?? '—'}</span> },
    { key: 'games', label: 'PJ', num: true },
    { key: 'mpg', label: 'MIN', num: true, render: (r) => num(r.mpg) },
    { key: 'ppg', label: 'PTS', num: true, render: (r) => num(r.ppg) },
    { key: 'rpg', label: 'REB', num: true, render: (r) => num(r.rpg) },
    { key: 'apg', label: 'AST', num: true, render: (r) => num(r.apg) },
    { key: 'pirpg', label: 'VAL', num: true, render: (r) => num(r.pirpg) }
  ]
  return (
    <Section
      eyebrow={data.season?.label}
      title={`Plantilla · ${data.roster.filter((r) => r.is_active).length} jugadores`}
      actions={
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: 'cards', label: 'Fichas' },
            { id: 'table', label: 'Tabla' }
          ]}
        />
      }
    >
      {view === 'table' ? (
        <DataTable rows={data.roster} columns={columns} rowKey={(r) => r.player_id} initialSort={{ key: 'jersey_number', dir: 'asc' }} />
      ) : (
        <div>
          {POSITION_GROUPS.map((grp) => {
            const list = data.roster.filter((r) => grp.codes.includes(r.position_code ?? '') || (grp.codes.includes('') && !r.position_code))
            if (!list.length) return null
            return (
              <div key={grp.label} className="position-group">
                <h3>
                  {grp.label} · {list.length}
                </h3>
                <div className="roster-grid">
          {list.map((r) => (
            <a key={r.player_id} className={`roster-card ${r.is_active ? '' : 'inactive'}`} href={href.player(r.player_ref, r.display_name)}>
              <div className="rc-top" style={{ background: `linear-gradient(160deg, ${color}, ${color}aa)` }}>
                <span className="rc-num">{r.jersey_number}</span>
                <CardPhoto src={r.photo_nobg} name={r.display_name} />
              </div>
              <div className="rc-body">
                <div className="rc-name">{r.display_name}</div>
                <div className="rc-sub">
                  {[r.position, r.nationality, age(r.birth_date) ? `${age(r.birth_date)} años` : null, r.height_cm ? `${r.height_cm} cm` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  {!r.is_active && ' · Baja'}
                </div>
                <div className="rc-stats">
                  <span>
                    <b>{num(r.ppg)}</b>PTS
                  </span>
                  <span>
                    <b>{num(r.rpg)}</b>REB
                  </span>
                  <span>
                    <b>{num(r.apg)}</b>AST
                  </span>
                  <span>
                    <b>{num(r.pirpg)}</b>VAL
                  </span>
                </div>
              </div>
            </a>
          ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

const POSITION_GROUPS = [
  { label: 'Bases', codes: ['PG'] },
  { label: 'Escoltas', codes: ['SG'] },
  { label: 'Aleros', codes: ['SF'] },
  { label: 'Ala-pívots', codes: ['PF'] },
  { label: 'Pívots', codes: ['C'] },
  { label: 'Otros', codes: [''] }
]

function ClubStats({ data }: { data: ClubData }) {
  const s = data.stats
  if (!s) return <Empty>Sin partidos jugados en esta temporada.</Empty>
  return (
    <div className="stack">
      <Section eyebrow={data.season?.label} title="Estadísticas del equipo · por partido">
        <div className="stat-tiles">
          <StatTile label="Puntos" value={num(s.ppg)} sub={`Reciben ${num(s.opp_ppg)}`} />
          <StatTile label="Diferencia" value={num(s.diff_pg)} />
          <StatTile label="Rebotes" value={num(s.rpg)} sub={`${num(s.orpg)} of. · ${num(s.drpg)} def.`} />
          <StatTile label="Asistencias" value={num(s.apg)} />
          <StatTile label="Robos" value={num(s.spg)} />
          <StatTile label="Tapones" value={num(s.bpg)} />
          <StatTile label="Pérdidas" value={num(s.tpg)} />
          <StatTile label="Valoración" value={num(s.pirpg)} />
          <StatTile label="T2%" value={pct(s.fg2_pct)} />
          <StatTile label="T3%" value={pct(s.fg3_pct)} />
          <StatTile label="TL%" value={pct(s.ft_pct)} />
          <StatTile label="TS%" value={pct(s.ts_pct)} />
          <StatTile label="Espectadores" value={int(s.attendance_avg)} sub={`Total ${int(s.attendance_total)} · máx. ${int(s.attendance_max)}`} />
        </div>
      </Section>
      <Section title="Estadísticas de los jugadores">
        <PlayerStatsTable rows={data.playerStats} showTeam={false} filters={false} />
      </Section>
    </div>
  )
}

function CabinetMini({ data }: { data: ClubData }) {
  const count = (c: ClubHonour['competition'], role: ClubHonour['role']) => data.honours.filter((h) => h.competition === c && h.role === role).length
  if (!data.honours.length) return null
  return (
    <Section title="Vitrina" actions={<a className="link" href={href.club(data.club.ref, data.club.name, 'palmares')}>Palmarés →</a>}>
      <div className="row" style={{ justifyContent: 'space-around', alignItems: 'flex-end' }}>
        {(['liga', 'copa', 'supercopa'] as const).map((c) => (
          <div key={c} style={{ textAlign: 'center' }}>
            <div style={{ height: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <Trophy competition={c} size={c === 'liga' ? 86 : 70} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{count(c, 'champion')}</div>
            <div className="small muted">{TROPHIES[c].name}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Cabinet({ data }: { data: ClubData }) {
  if (!data.honours.length) return <Empty>Este club no tiene títulos ni finales en Liga, Copa del Rey o Supercopa.</Empty>
  return (
    <div className="stack">
      <div className="cabinet">
        {(['liga', 'copa', 'supercopa'] as const).map((c) => {
          const won = data.honours.filter((h) => h.competition === c && h.role === 'champion')
          const lost = data.honours.filter((h) => h.competition === c && h.role === 'runner_up')
          return (
            <div key={c} className="cabinet-item">
              <Trophy competition={c} size={c === 'liga' ? 110 : 90} />
              <div>
                <div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {TROPHIES[c].name}
                </div>
                <div className="count">
                  {won.length}
                  <small>{won.length === 1 ? 'título' : 'títulos'}</small>
                </div>
                <div className="runner">{lost.length} subcampeonatos</div>
              </div>
            </div>
          )
        })}
      </div>
      {(['liga', 'copa', 'supercopa'] as const).map((c) => {
        const list = data.honours.filter((h) => h.competition === c)
        if (!list.length) return null
        return (
          <Section key={c} title={TROPHIES[c].name}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>
              Campeón
            </div>
            <div className="years">
              {list
                .filter((h) => h.role === 'champion')
                .map((h) => (
                  <span key={h.season_start_year} className="chip gold" title={h.opponent ? `Final ante ${h.opponent} ${h.result ?? ''}` : undefined}>
                    🏆 {h.label}
                  </span>
                ))}
            </div>
            {list.some((h) => h.role === 'runner_up') && (
              <>
                <div className="small muted" style={{ fontWeight: 700, margin: '14px 0 6px' }}>
                  Subcampeón
                </div>
                <div className="years">
                  {list
                    .filter((h) => h.role === 'runner_up')
                    .map((h) => (
                      <span key={h.season_start_year} className="chip" title={h.opponent ? `Final ante ${h.opponent} ${h.result ?? ''}` : undefined}>
                        {h.label}
                      </span>
                    ))}
                </div>
              </>
            )}
            <div className="table-wrap mt">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Temporada</th>
                    <th>Resultado</th>
                    <th>Rival en la final</th>
                    <th>Marcador / serie</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((h) => (
                    <tr key={h.season_start_year}>
                      <td>
                        <b>{h.label}</b>
                      </td>
                      <td>{h.role === 'champion' ? <span className="chip gold">Campeón</span> : <span className="chip">Subcampeón</span>}</td>
                      <td>{h.opponent ?? '—'}</td>
                      <td>{h.result && h.result !== 'N/A' ? h.result : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )
      })}
      <p className="note">Fuente del palmarés: Wikipedia (CC BY-SA 4.0). Fotos de trofeos: Brgesto, Wikimedia Commons (CC BY-SA 4.0).</p>
    </div>
  )
}

function History({ data }: { data: ClubData }) {
  const { club, records } = data
  const rec = (r?: typeof records.acb, label?: string) =>
    r && (
      <Section title={label}>
        <div className="stat-tiles">
          <StatTile label="Temporadas" value={int(r.seasons)} />
          <StatTile label="Partidos" value={int(r.games)} />
          <StatTile label="Victorias" value={int(r.wins)} sub={r.games ? pct((100 * (r.wins ?? 0)) / r.games) : undefined} />
          <StatTile label="Derrotas" value={int(r.losses)} />
          <StatTile label="Puesto histórico" value={r.position ? `${r.position}º` : '—'} />
          <StatTile label="Puntos a favor" value={int(r.points_for)} />
          <StatTile label="Veces 1º / 2º" value={`${r.first_places ?? 0} / ${r.second_places ?? 0}`} sub="Clasificación final" />
          {r.best_margin != null && <StatTile label="Mayor victoria" value={`+${r.best_margin}`} />}
        </div>
      </Section>
    )
  return (
    <div className="grid grid-main">
      <div className="stack">
        <Section title={club.name} eyebrow="Historia">
          {club.history ? (
            <>
              <p className="history-text">{club.history}</p>
              <p className="note">
                Fuente: {club.history_url ? <ExternalLink url={club.history_url}>Wikipedia</ExternalLink> : 'Wikipedia'} (CC BY-SA 4.0).
              </p>
            </>
          ) : (
            <p className="muted">Sin resumen histórico disponible.</p>
          )}
          <dl className="kv mt">
            {club.founded_year && (
              <>
                <dt>Fundación</dt>
                <dd>{club.founded_year}</dd>
              </>
            )}
            {club.president && (
              <>
                <dt>Presidente</dt>
                <dd>{club.president}</dd>
              </>
            )}
            {club.arena && (
              <>
                <dt>Pabellón</dt>
                <dd>{club.arena}</dd>
              </>
            )}
          </dl>
        </Section>
        {rec(records.acb, 'En la era ACB (desde 1983-84)')}
        {rec(records.total, 'Liga Nacional + ACB (desde 1956-57)')}
      </div>
      <div className="stack">
        <CabinetMini data={data} />
        {data.seasons.length > 0 && (
          <Section title="Temporadas con datos">
            {data.seasons.map((s) => (
              <div key={s.team_id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
                <b>{s.label}</b>
                <span className="spacer">{s.team_name}</span>
                <a className="link" href={href.club(club.ref, club.name, 'resumen', s.start_year)}>
                  Ver →
                </a>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}
