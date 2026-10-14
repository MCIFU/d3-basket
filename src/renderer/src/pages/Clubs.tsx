import { useState } from 'react'
import type { ClubData, ClubHonour } from '../../../shared/api'
import {
  CardPhoto,
  CourtPlayer,
  HalfCourt,
  RankSheet,
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
  { id: 'info', label: 'Info' },
  { id: 'palmares', label: 'Palmarés' }
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
        style={{ ['--club' as string]: color, ['--club2' as string]: second }}
      >
        <div className="hero-grid">
          <div className="hero-logo">
            <TeamLogo src={club.logo} name={club.name} size={88} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{data.team ? `${data.competition?.name ?? ''} ${season?.label ?? ''}` : 'Club histórico'}</div>
            <h1>{data.team?.name ?? club.name}</h1>
            <div className="hero-facts">
              {club.city && (
                <div className="hero-fact">
                  <div className="k">Ciudad</div>
                  <div className="v">{club.city}</div>
                </div>
              )}
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
      {(tab === 'info' || tab === 'historia') && <ClubInfoTab data={data} />}
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

function Performance({ data }: { data: ClubData }) {
  const s = data.stats
  if (!s) return null
  const r = data.ranks
  const n = data.teamsInLeague
  const rk = (k: string) => (r[k] != null ? { rank: r[k], of: n } : undefined)
  const home = data.games.filter((g) => g.status === 'finished' && g.home.team_id === data.team?.team_id)
  const away = data.games.filter((g) => g.status === 'finished' && g.away.team_id === data.team?.team_id)
  const wins = (list: typeof home, isHome: boolean) =>
    list.filter((g) => (isHome ? g.home_score! > g.away_score! : g.away_score! > g.home_score!)).length
  return (
    <Section title="Rendimiento de la temporada" eyebrow={`${data.season?.label} · puesto entre los ${n} equipos de la liga`}>
      <RankSheet
        scope={data.competition?.name}
        groups={[
          {
            title: 'Ataque',
            rows: [
              { label: 'Puntos', value: num(s.ppg), sub: `${int(s.pts)} en total`, rank: rk('ppg') },
              { label: 'True shooting', value: pct(s.ts_pct), sub: `eFG ${pct(s.efg_pct)}`, rank: rk('ts_pct') },
              { label: 'Triples', value: pct(s.fg3_pct), sub: `${s.fg3m}/${s.fg3a}`, rank: rk('fg3_pct') },
              { label: 'Asistencias', value: num(s.apg), rank: rk('apg') }
            ]
          },
          {
            title: 'Defensa y rebote',
            rows: [
              { label: 'Recibidos', value: num(s.opp_ppg), sub: 'menos es mejor', rank: rk('opp_ppg') },
              { label: 'Rebotes', value: num(s.rpg), sub: `${num(s.orpg)} of. · ${num(s.drpg)} def.`, rank: rk('rpg') },
              { label: 'Robos', value: num(s.spg), rank: rk('spg') },
              { label: 'Tapones', value: num(s.bpg), rank: rk('bpg') }
            ]
          },
          {
            title: 'Global',
            rows: [
              { label: 'Diferencia', value: (s.diff_pg > 0 ? '+' : '') + num(s.diff_pg), sub: 'puntos por partido', rank: rk('diff_pg') },
              { label: 'Valoración', value: num(s.pirpg), rank: rk('pirpg') },
              { label: 'Pérdidas', value: num(s.tpg), sub: 'menos es mejor', rank: rk('tpg') },
              ...(s.attendance_avg != null
                ? [{ label: 'Público', value: int(s.attendance_avg), sub: 'espectadores de media', rank: rk('attendance_avg') }]
                : [])
            ]
          }
        ]}
      />
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

// Puestos de la pista y posiciones oficiales que caben en cada uno (ACB y FEB).
const FIVE: ['PG' | 'SG' | 'SF' | 'PF' | 'C', RegExp][] = [
  ['PG', /^base/i],
  ['SG', /escolta/i],
  ['SF', /^alero/i],
  ['PF', /ala-?p[ií]vot/i],
  ['C', /^p[ií]vot/i]
]

/** El mejor jugador de cada puesto por valoración, dibujado sobre la pista. */
function BestFive({ data }: { data: ClubData }) {
  const pool = data.roster.filter((r) => r.games > 0).sort((a, b) => (b.pirpg ?? 0) - (a.pirpg ?? 0))
  const used = new Set<number>()
  const five = FIVE.map(([spot, re]) => {
    const r = pool.find((x) => !used.has(x.player_id) && re.test(x.position ?? '')) ?? pool.find((x) => !used.has(x.player_id))
    if (r) used.add(r.player_id)
    return r && { spot, r }
  }).filter(Boolean) as { spot: 'PG' | 'SG' | 'SF' | 'PF' | 'C'; r: (typeof pool)[number] }[]
  const rank = data.ranks.pirpg
  const surname = (n: string) => n.split(' ').filter((w) => !/^(jr\.?|sr\.?|ii|iii)$/i.test(w)).slice(-1)[0] ?? n
  return (
    <HalfCourt label="Mejor quinteto por valoración" note={rank === 1 ? `${num(data.stats?.pirpg)} de valoración: 1º de la liga` : undefined}>
      {five.map(({ spot, r }) => (
        <CourtPlayer key={r.player_id} spot={spot} to={href.player(r.player_ref, r.display_name)} photo={r.photo_nobg ?? r.photo} name={surname(r.display_name)} tag={`${num(r.pirpg)} val`} color={data.club.color} />
      ))}
    </HalfCourt>
  )
}

function ClubSummary({ data }: { data: ClubData }) {
  const { club } = data
  return (
    <div className="stack">
      <Performance data={data} />
      {data.roster.some((r) => r.games > 0) && (
        <div className="board">
          <BestFive data={data} />
          <div className="stack">
            <RecentResults data={data} />
            <CabinetMini data={data} />
          </div>
        </div>
      )}
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
          {!data.roster.some((r) => r.games > 0) && <RecentResults data={data} />}
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
          {!data.roster.some((r) => r.games > 0) && <CabinetMini data={data} />}
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

const COMPS = ['liga', 'copa', 'supercopa'] as const

/** Década → 10 casillas (una por temporada) con el resultado del club en esa competición. */
function HonourGrid({ list, from }: { list: ClubHonour[]; from: number }) {
  const by = new Map(list.map((h) => [h.season_start_year, h]))
  const now = new Date().getFullYear()
  const decades: number[] = []
  for (let d = Math.floor(from / 10) * 10; d <= now; d += 10) decades.push(d)
  return (
    <div className="honour-grid">
      {decades.map((d) => (
        <div key={d} className="hg-row">
          <span className="hg-dec">{d}s</span>
          {Array.from({ length: 10 }, (_, i) => {
            const y = d + i
            const h = by.get(y)
            return (
              <span
                key={y}
                className={`hg-cell${h ? (h.role === 'champion' ? ' gold' : ' silver') : ''}${y > now ? ' future' : ''}`}
                title={h ? `${h.label} · ${h.role === 'champion' ? 'Campeón' : 'Subcampeón'}${h.opponent ? ` ante ${h.opponent}` : ''}${h.result && h.result !== 'N/A' ? ` (${h.result})` : ''}` : `${y}-${String((y + 1) % 100).padStart(2, '0')}`}
              >
                {h ? String(y % 100).padStart(2, '0') : ''}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function FinalsList({ list }: { list: ClubHonour[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? list : list.slice(0, 8)
  return (
    <div className="finals-list mt">
      {shown.map((h) => (
        <div key={h.season_start_year} className={`final-row ${h.role === 'champion' ? 'won' : 'lost'}`}>
          <span className="fr-season">{h.label}</span>
          <span className={`chip ${h.role === 'champion' ? 'gold' : ''}`}>{h.role === 'champion' ? '🏆 Campeón' : 'Subcampeón'}</span>
          <span className="fr-opp">{h.opponent ? `${h.role === 'champion' ? 'ante' : 'perdió ante'} ${h.opponent}` : '—'}</span>
          <span className="fr-res">{h.result && h.result !== 'N/A' ? h.result : ''}</span>
        </div>
      ))}
      {list.length > 8 && (
        <button className="btn mt" style={{ justifySelf: 'start' }} onClick={() => setAll(!all)}>
          {all ? 'Ver menos' : `Ver las ${list.length} finales`}
        </button>
      )}
    </div>
  )
}

function Cabinet({ data }: { data: ClubData }) {
  if (!data.honours.length)
    return <Empty>Este club no tiene títulos ni finales de Liga, Copa del Rey o Supercopa (la FEB no publica palmarés histórico).</Empty>
  const won = data.honours.filter((h) => h.role === 'champion')
  const finals = data.honours.length
  const first = [...won].sort((a, b) => a.season_start_year - b.season_start_year)[0]
  const last = won[0]
  return (
    <div className="stack">
      <div className="honour-summary">
        <div>
          <b>{won.length}</b>
          <span>títulos</span>
        </div>
        <div>
          <b>{finals}</b>
          <span>finales</span>
        </div>
        <div>
          <b>{pct((100 * won.length) / finals)}</b>
          <span>finales ganadas</span>
        </div>
        {first && (
          <div>
            <b>{first.label}</b>
            <span>primer título · {TROPHIES[first.competition].name}</span>
          </div>
        )}
        {last && (
          <div>
            <b>{last.label}</b>
            <span>último título · {TROPHIES[last.competition].name}</span>
          </div>
        )}
      </div>

      <div className="cabinet">
        {COMPS.map((c) => {
          const w = data.honours.filter((h) => h.competition === c && h.role === 'champion')
          const l = data.honours.filter((h) => h.competition === c && h.role === 'runner_up')
          return (
            <div key={c} className={`cabinet-item${w.length ? '' : ' empty'}`}>
              <Trophy competition={c} size={c === 'liga' ? 110 : 90} />
              <div>
                <div className="cab-name">{TROPHIES[c].name}</div>
                <div className="count">
                  {w.length}
                  <small>{w.length === 1 ? 'título' : 'títulos'}</small>
                </div>
                <div className="runner">
                  {l.length} {l.length === 1 ? 'subcampeonato' : 'subcampeonatos'}
                  {w[0] ? ` · último ${w[0].label}` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {COMPS.map((c) => {
        const list = data.honours.filter((h) => h.competition === c)
        if (!list.length) return null
        return (
          <Section key={c} title={TROPHIES[c].name} eyebrow={`${list.filter((h) => h.role === 'champion').length} títulos · ${list.length} finales`}>
            <HonourGrid list={list} from={Math.min(...list.map((h) => h.season_start_year))} />
            <div className="row small muted mt" style={{ gap: 14 }}>
              <span className="legend-dot gold" /> Campeón
              <span className="legend-dot silver" /> Subcampeón
            </div>
            <FinalsList list={list} />
          </Section>
        )
      })}
      <p className="note">Fuente del palmarés: Wikipedia (CC BY-SA 4.0). Fotos de trofeos: Brgesto, Wikimedia Commons (CC BY-SA 4.0).</p>
    </div>
  )
}

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', twitter: 'X', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }
const STAFF_LABEL: Record<string, string> = { head_coach: 'Entrenador', assistant_coach: 'Ayudante', assistant: 'Ayudante' }

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  if (children == null || children === false || children === '') return null
  return (
    <div className="fact">
      <div className="fact-k">{k}</div>
      <div className="fact-v">{children}</div>
    </div>
  )
}

function ClubInfoTab({ data }: { data: ClubData }) {
  const { club, records } = data
  const now = new Date().getFullYear()
  const web = club.website && (/^https?:/.test(club.website) ? club.website : `https://${club.website}`)
  const socials = Object.entries(club.socials).filter(([k]) => SOCIAL_LABEL[k])
  const staff = data.staff.filter((s) => s.name)
  // Temporadas agrupadas en tramos consecutivos de la misma competición.
  const spans: { code: string; from: string; to: string; n: number }[] = []
  for (const s of [...data.seasons].sort((a, b) => a.start_year - b.start_year)) {
    const last = spans[spans.length - 1]
    if (last && last.code === s.competition_code) (last.to = s.label), last.n++
    else spans.push({ code: s.competition_code, from: s.label, to: s.label, n: 1 })
  }
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
        <Section title="Ficha del club">
          <div className="facts">
            <Fact k="Nombre">{data.team?.name ?? club.name}</Fact>
            <Fact k="Club">{data.team && data.team.name !== club.name ? club.name : null}</Fact>
            <Fact k="Ciudad">{club.city}</Fact>
            <Fact k="Fundación">{club.founded_year && `${club.founded_year} · ${now - club.founded_year} años`}</Fact>
            <Fact k="Competición">{data.competition && `${data.competition.name} ${data.season?.label ?? ''}`}</Fact>
            <Fact k="Presidente">{club.president}</Fact>
            {staff.map((s, i) => (
              <Fact key={i} k={STAFF_LABEL[s.role] ?? 'Cuerpo técnico'}>
                {s.name}
              </Fact>
            ))}
            <Fact k="Colores">
              {club.color && (
                <span className="row" style={{ gap: 6 }}>
                  <span className="swatch" style={{ background: club.color }} />
                  {club.color2 && <span className="swatch" style={{ background: club.color2 }} />}
                </span>
              )}
            </Fact>
            <Fact k="Web">
              {web && (
                <ExternalLink url={web}>
                  <span className="link">{web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗</span>
                </ExternalLink>
              )}
            </Fact>
            <Fact k="Redes">
              {socials.length > 0 && (
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {socials.map(([k, url]) => (
                    <ExternalLink key={k} url={url}>
                      <span className="chip">{SOCIAL_LABEL[k]} ↗</span>
                    </ExternalLink>
                  ))}
                </span>
              )}
            </Fact>
          </div>
        </Section>

        {club.arena && (
          <Section title="Pabellón">
            <div className={`arena${club.arena_photo_url ? ' has-photo' : ''}`}>
              {club.arena_photo_url && <img src={club.arena_photo_url} alt="" loading="lazy" />}
              <div className="facts">
                <Fact k="Nombre">{club.arena}</Fact>
                <Fact k="Aforo">{club.arena_capacity ? `${int(club.arena_capacity)} espectadores` : null}</Fact>
                <Fact k="Dirección">
                  {club.arena_address && (
                    <ExternalLink url={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${club.arena}, ${club.arena_address}`)}`}>
                      <span className="link">{club.arena_address} ↗</span>
                    </ExternalLink>
                  )}
                </Fact>
                <Fact k="Público esta temporada">
                  {data.stats?.attendance_avg != null &&
                    `${int(data.stats.attendance_avg)} de media${club.arena_capacity ? ` · ${pct((100 * data.stats.attendance_avg) / club.arena_capacity)} de ocupación` : ''}`}
                </Fact>
              </div>
            </div>
          </Section>
        )}

        <Section title="Historia">
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
        </Section>
        {rec(records.acb, 'En la era ACB (desde 1983-84)')}
        {rec(records.total, 'Liga Nacional + ACB (desde 1956-57)')}
      </div>
      <div className="stack">
        <CabinetMini data={data} />
        {spans.length > 0 && (
          <Section title="Trayectoria">
            <ol className="trajectory">
              {[...spans].reverse().map((t, i) => (
                <li key={i}>
                  <b>{t.from === t.to ? t.from : `${t.from} → ${t.to}`}</b>
                  <span>
                    {leagueTheme(t.code)?.name ?? t.code} · {t.n} {t.n === 1 ? 'temporada' : 'temporadas'}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}
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
