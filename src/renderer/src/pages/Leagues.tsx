import { useMemo, useState } from 'react'
import type { ClubRecordRow, GameRow, HonourRow, LeagueData, StandingRow } from '../../../shared/api'
import type { ReactNode } from 'react'
import {
  DataTable,
  Empty,
  Form,
  GameCard,
  Loading,
  Section,
  Segmented,
  StatTile,
  TROPHIES,
  Tabs,
  TeamLink,
  TeamLogo,
  Trophy,
  useLoad,
  type Column
} from '../components'
import { int, mix, num, pct, signed } from '../format'
import { brandVars, leagueTheme, zoneOf } from '../leagues'
import { href, navigate } from '../router'
import { LeadersBox } from './Home'
import { PlayerStatsTable, TeamStatsTable } from './StatTables'

export function LeaguesPage() {
  const [comps, error] = useLoad(() => window.d3.competitions(), [])
  if (!comps) return <Loading error={error} />
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Competiciones</div>
        <h1>Ligas</h1>
        <p>Baloncesto profesional y semiprofesional español.</p>
      </div>
      <div className="grid grid-4">
        {comps.map((c) => (
          <LeagueCard key={c.code} code={c.code} name={c.name} soon={c.editions === 0}>
            <div className="muted">Temporada {c.current_label}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="chip brand">
                {c.editions === 0 ? 'Próximamente' : `${c.editions} temporada${c.editions === 1 ? '' : 's'} con datos`}
              </span>
            </div>
          </LeagueCard>
        ))}
      </div>
    </>
  )
}

/** Tarjeta de liga con su color y logo oficiales. */
export function LeagueCard({ code, name, soon, children }: { code: string; name: string; soon?: boolean; children?: ReactNode }) {
  const t = leagueTheme(code)
  const body = (
    <>
      <span className="league-card-stripe" />
      <div className="tier">{t?.division}</div>
      <h3>{name}</h3>
      {children}
      {t && <img className="league-card-logo" src={t.logo} alt="" loading="lazy" />}
    </>
  )
  const style = t ? brandVars(t.color, t.color2) : undefined
  return soon ? (
    <div className="league-card soon" style={style}>
      {body}
    </div>
  ) : (
    <a className="league-card" href={href.league(code)} style={style}>
      {body}
    </a>
  )
}

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'clasificacion', label: 'Clasificación' },
  { id: 'resultados', label: 'Calendario y resultados' },
  { id: 'equipos', label: 'Estadísticas de equipos' },
  { id: 'jugadores', label: 'Estadísticas de jugadores' },
  { id: 'palmares', label: 'Palmarés' },
  { id: 'historico', label: 'Clasificación histórica' }
]

export function LeaguePage({ code, tab = 'resumen', year }: { code: string; tab?: string; year?: number }) {
  const [data, error] = useLoad(() => window.d3.league(code, year), [code, year])
  if (error) return <Loading error={error} />
  if (data === undefined) return <Loading />
  if (!data) return <Empty>No se ha encontrado esta liga.</Empty>
  const { edition, competition } = data
  const selectedYear = year ?? edition?.start_year
  const attendance = data.teamStats.reduce((a, t) => a + t.attendance_total, 0)
  const theme = leagueTheme(code)
  // Cabecera con la paleta oficial: del color complementario (oscurecido) al color de la liga.
  const heroBg = theme
    ? `linear-gradient(115deg, ${mix(theme.color2, '#000000', 0.7)} 0%, ${mix(theme.color2, '#000000', 0.5)} 52%, ${theme.color} 145%)`
    : undefined

  return (
    <div style={theme ? brandVars(theme.color, theme.color2) : undefined}>
      <section className="hero league-hero" style={{ background: heroBg }}>
        <div className="hero-grid">
          <div className="hero-logo">{theme ? <img className="league-logo" src={theme.logo} alt={competition.name} /> : <Trophy competition="liga" size={96} />}</div>
          <div>
            <div className="eyebrow">{theme?.division ?? competition.organizer}</div>
            <h1>{competition.name}</h1>
            <div className="row" style={{ marginTop: 12 }}>
              {data.editions.length > 0 && (
                <select
                  className="select"
                  value={selectedYear}
                  onChange={(e) => navigate(href.league(code, tab, Number(e.target.value)))}
                  aria-label="Temporada"
                >
                  {data.editions.map((e) => (
                    <option key={e.id} value={e.start_year}>
                      Temporada {e.season_label}
                    </option>
                  ))}
                </select>
              )}
              {edition?.is_current ? <span className="chip">En curso</span> : null}
            </div>
          </div>
          {edition && (
            <div className="hero-side">
              <div className="stat-tiles">
                <StatTile label="Equipos" value={edition.teams} />
                <StatTile label="Partidos jugados" value={`${edition.finished}/${edition.games}`} />
                {attendance > 0 && <StatTile label="Espectadores" value={int(attendance)} />}
                <StatTile
                  label="Puntos por partido"
                  value={num(data.teamStats.reduce((a, t) => a + t.pts, 0) / Math.max(1, data.teamStats.reduce((a, t) => a + t.games, 0)))}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <Tabs
        active={tab}
        items={TABS.filter((t) => code === 'ACB' || !['palmares', 'historico'].includes(t.id)).map((t) => ({ ...t, href: href.league(code, t.id, year) }))}
      />

      {tab === 'resumen' && <Summary data={data} />}
      {tab === 'clasificacion' && (
        <Section eyebrow={edition?.season_label} title="Clasificación · liga regular">
          <StandingsTable rows={data.standings} year={selectedYear} code={code} />
        </Section>
      )}
      {tab === 'resultados' && <Results games={data.games} />}
      {tab === 'equipos' && (
        <Section eyebrow={edition?.season_label} title="Estadísticas de equipos">
          {data.teamStats.length ? <TeamStatsTable rows={data.teamStats} /> : <Empty>Sin partidos jugados todavía.</Empty>}
        </Section>
      )}
      {tab === 'jugadores' && (
        <Section eyebrow={edition?.season_label} title="Estadísticas de jugadores">
          {data.playerStats.length ? <PlayerStatsTable rows={data.playerStats} /> : <Empty>Sin partidos jugados todavía.</Empty>}
        </Section>
      )}
      {tab === 'palmares' && <Honours honours={data.honours} />}
      {tab === 'historico' && <AllTime rows={data.alltime} />}
    </div>
  )
}

function Summary({ data }: { data: LeagueData }) {
  const stats = data.playerStats
  const leaders = useMemo(() => {
    const maxGames = Math.max(0, ...stats.map((s) => s.games))
    const pool = stats.filter((s) => s.games >= maxGames / 2 && s.mpg >= 10)
    const top = (k: 'ppg' | 'rpg' | 'apg' | 'pirpg') =>
      [...pool]
        .sort((a, b) => b[k] - a[k])
        .slice(0, 5)
        .map((s) => ({ player_ref: s.player_ref, display_name: s.display_name, photo_nobg: s.photo_nobg, photo: s.photo, team: s.team, games: s.games, value: s[k] }))
    return { ppg: top('ppg'), rpg: top('rpg'), apg: top('apg'), pirpg: top('pirpg') }
  }, [stats])
  const last = [...data.games].reverse().filter((g) => g.status === 'finished').slice(0, 6)
  const champions = (['liga', 'copa', 'supercopa'] as const).map((c) => data.honours.find((h) => h.competition === c)).filter(Boolean) as HonourRow[]
  return (
    <div className="stack">
      <div className="grid grid-main">
        <Section title="Clasificación" actions={<a className="link" href={href.league(data.competition.code, 'clasificacion', data.edition?.start_year)}>Completa →</a>}>
          <StandingsTable rows={data.standings} compact year={data.edition?.start_year} code={data.competition.code} />
        </Section>
        <div className="stack">
          <LeadersBox leaders={leaders} />
          {champions.length > 0 && (
            <Section title="Últimos campeones">
              {champions.map((h) => (
                <div key={h.competition} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <Trophy competition={h.competition} size={40} />
                  <div className="spacer">
                    <div className="small muted">
                      {TROPHIES[h.competition].name} {h.label}
                    </div>
                    <div style={{ fontWeight: 700 }}>{h.champion_name}</div>
                  </div>
                  <TeamLogo src={h.champion_logo} name={h.champion_name} size={30} />
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
      {last.length > 0 && (
        <Section title="Últimos resultados">
          <div className="games-grid">
            {last.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

/** Selector de grupo para ligas divididas (Segunda FEB: A y B; Tercera FEB: A-A ... E-B). */
function GroupPills({ groups, value, onChange }: { groups: string[]; value: string; onChange: (g: string) => void }) {
  return (
    <div className="group-pills" role="group" aria-label="Grupo">
      {groups.map((g) => (
        <button key={g} className={g === value ? 'active' : ''} onClick={() => onChange(g)}>
          Grupo {g}
        </button>
      ))}
    </div>
  )
}

export function StandingsTable({ rows, compact, year, code }: { rows: StandingRow[]; compact?: boolean; year?: number; code?: string }) {
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group ?? ''))].filter(Boolean), [rows])
  const [group, setGroup] = useState<string>()
  if (!rows.length) return <Empty>Todavía no hay equipos en esta edición.</Empty>
  const current = groups.length > 1 ? (group ?? groups[0]) : undefined
  const list = current ? rows.filter((r) => r.group === current) : rows
  // Zonas solo en ligas de grupo único con formato conocido.
  const zones = groups.length > 1 ? [] : (leagueTheme(code)?.zones ?? [])
  const started = list.some((r) => r.played > 0)
  return (
    <div className="standings-wrap">
      {current && <GroupPills groups={groups} value={current} onChange={setGroup} />}
      <div className="table-wrap">
        <table className={`table standings${compact ? ' compact' : ''}${started ? ' started' : ''}`}>
          <thead>
            <tr>
              <th className="pos">#</th>
              <th>Equipo</th>
              <th className="num" title="Partidos jugados">PJ</th>
              <th className="num" title="Victorias">V</th>
              <th className="num" title="Derrotas">D</th>
              {!compact && (
                <>
                  <th className="num hide-sm" title="Porcentaje de victorias">%V</th>
                  <th className="num hide-sm" title="Puntos a favor">PF</th>
                  <th className="num hide-sm" title="Puntos en contra">PC</th>
                </>
              )}
              <th className="num" title="Diferencia de puntos">+/−</th>
              <th className="hide-sm">Últimos 5</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const zone = started ? zoneOf(zones, r.position, list.length) : undefined
              return (
                <tr key={r.team_id} className={zone ? `zone-${zone.kind}` : undefined} title={zone?.label}>
                  <td className="pos">
                    <span className="pos-badge">{r.position}</span>
                  </td>
                  <td className="team-cell">
                    <TeamLink team={r} year={year} size={compact ? 26 : 30} />
                  </td>
                  <td className="num">{r.played}</td>
                  <td className="num strong">{r.won}</td>
                  <td className="num">{r.lost}</td>
                  {!compact && (
                    <>
                      <td className="num hide-sm">{r.played ? pct((100 * r.won) / r.played) : '–'}</td>
                      <td className="num hide-sm">{r.points_for}</td>
                      <td className="num hide-sm">{r.points_against}</td>
                    </>
                  )}
                  <td className={`num diff ${r.diff > 0 ? 'diff-up' : r.diff < 0 ? 'diff-down' : ''}`}>{signed(r.diff)}</td>
                  <td className="hide-sm">
                    <Form results={r.form} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {started && zones.length > 0 && (
        <div className="zone-legend">
          {zones.map((z) => (
            <span key={z.label} className={`zone-key zone-${z.kind}`}>
              {z.label}
            </span>
          ))}
        </div>
      )}
      {!started && <p className="note">La temporada aún no ha empezado: equipos por orden alfabético.</p>}
    </div>
  )
}

function Results({ games }: { games: GameRow[] }) {
  const knockout = useMemo(() => games.filter((g) => g.phase && g.phase !== 'regular'), [games])
  const [mode, setMode] = useState<'regular' | 'knockout'>()
  // Temporada terminada con eliminatorias: se abre en ellas; si no, en la liga regular.
  const regularLeft = games.some((g) => g.phase === 'regular' && g.status !== 'finished')
  const current = mode ?? (knockout.length && !regularLeft ? 'knockout' : 'regular')
  return (
    <Section
      title={current === 'knockout' ? 'Eliminatorias' : 'Liga regular'}
      eyebrow="Calendario y resultados"
      actions={
        knockout.length > 0 && (
          <Segmented
            value={current}
            options={[
              { id: 'regular', label: 'Liga regular' },
              { id: 'knockout', label: 'Eliminatorias' }
            ]}
            onChange={setMode}
          />
        )
      }
    >
      {current === 'knockout' ? <Knockout games={knockout} /> : <RegularRounds games={games.filter((g) => !g.phase || g.phase === 'regular')} />}
      <p className="note">Pulsa un partido jugado para ver su estadística completa.</p>
    </Section>
  )
}

/** Eliminatorias agrupadas por ronda ("Cuartos de final", "Final del grupo A"...), en orden cronológico. */
function Knockout({ games }: { games: GameRow[] }) {
  const stages = useMemo(() => {
    const map = new Map<string, { name: string; order: number; games: GameRow[] }>()
    for (const g of games) {
      const name = (g.round_name ?? 'Eliminatoria').replace(/ · (Partido|Jornada) \d+$/, '')
      // La fase final (Tercera FEB) va después de las eliminatorias de grupo.
      const e = map.get(name) ?? { name, order: g.phase === 'final' ? 999 : Math.floor((g.round_number ?? 0) / 10), games: [] }
      e.games.push(g)
      map.set(name, e)
    }
    return [...map.values()]
      .map((s) => ({ ...s, games: [...s.games].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')) }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }, [games])
  return (
    <>
      {stages.map((s) => (
        <div key={s.name} className="stage">
          <div className="stage-title">{s.name}</div>
          <div className="games-grid">
            {s.games.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function RegularRounds({ games }: { games: GameRow[] }) {
  const groups = useMemo(() => [...new Set(games.map((g) => g.group ?? ''))].filter(Boolean).sort(), [games])
  const [group, setGroup] = useState<string>()
  const currentGroup = groups.length > 1 ? (group ?? groups[0]) : undefined
  const rounds = useMemo(() => {
    const map = new Map<number, { number: number; games: GameRow[] }>()
    for (const g of games) {
      if (currentGroup && g.group !== currentGroup) continue
      const n = g.round_number ?? 0
      if (!map.has(n)) map.set(n, { number: n, games: [] })
      map.get(n)!.games.push(g)
    }
    return [...map.values()].sort((a, b) => a.number - b.number)
  }, [games, currentGroup])
  const initial = rounds.find((r) => r.games.some((g) => g.status !== 'finished')) ?? rounds[rounds.length - 1]
  const [selected, setSelected] = useState<number>()
  const round = rounds.find((r) => r.number === (selected ?? initial?.number))
  if (!rounds.length) return <Empty>Sin calendario.</Empty>
  return (
    <>
      {currentGroup && <GroupPills groups={groups} value={currentGroup} onChange={setGroup} />}
      <div className="rounds">
        {rounds.map((r) => (
          <button
            key={r.number}
            className={`${r.number === round?.number ? 'active' : ''} ${r.games.every((g) => g.status === 'finished') ? 'played' : ''}`}
            onClick={() => setSelected(r.number)}
            title={`Jornada ${r.number}`}
          >
            {r.number}
          </button>
        ))}
      </div>
      <div className="stage-title">
        Jornada {round?.number}
        {currentGroup ? ` · Grupo ${currentGroup}` : ''}
      </div>
      <div className="games-grid">
        {round?.games.map((g) => (
          <GameCard key={g.id} g={g} />
        ))}
      </div>
    </>
  )
}

function Honours({ honours }: { honours: HonourRow[] }) {
  const [comp, setComp] = useState<HonourRow['competition']>('liga')
  const list = honours.filter((h) => h.competition === comp)
  const byClub = useMemo(() => {
    const map = new Map<string, { name: string; ref: string | null; logo: string | null; titles: string[]; runner: number }>()
    for (const h of list) {
      const k = h.champion_ref ?? h.champion_name
      const e = map.get(k) ?? { name: h.champion_name, ref: h.champion_ref, logo: h.champion_logo, titles: [], runner: 0 }
      e.titles.push(h.label)
      map.set(k, e)
      if (h.runner_up_name) {
        const rk = h.runner_up_ref ?? h.runner_up_name
        const r = map.get(rk) ?? { name: h.runner_up_name, ref: h.runner_up_ref, logo: h.runner_up_logo, titles: [], runner: 0 }
        r.runner++
        map.set(rk, r)
      }
    }
    return [...map.values()].filter((c) => c.titles.length).sort((a, b) => b.titles.length - a.titles.length || b.runner - a.runner)
  }, [list])

  return (
    <div className="stack">
      <div className="row">
        <Segmented
          value={comp}
          onChange={setComp}
          options={[
            { id: 'liga', label: 'Liga' },
            { id: 'copa', label: 'Copa del Rey' },
            { id: 'supercopa', label: 'Supercopa' }
          ]}
        />
      </div>
      <div className="grid grid-main">
        <Section eyebrow={TROPHIES[comp].name} title="Campeones por temporada">
          {list.map((h) => (
            <div key={h.season_start_year} className="honour-row">
              <span className="season">{h.label}</span>
              <span className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <TeamLogo src={h.champion_logo} name={h.champion_name} size={26} />
                {h.champion_ref ? (
                  <a className="player-link" href={href.club(h.champion_ref, h.champion_name, 'palmares')}>
                    {h.champion_name}
                  </a>
                ) : (
                  <b>{h.champion_name}</b>
                )}
              </span>
              <span className="result">{h.result && h.result !== 'N/A' ? h.result : ''}</span>
              <span className="runner">{h.runner_up_name ?? ''}</span>
            </div>
          ))}
        </Section>
        <Section title="Títulos por club">
          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <Trophy competition={comp} size={110} />
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Club</th>
                <th className="num">Títulos</th>
                <th className="num">Finales perdidas</th>
              </tr>
            </thead>
            <tbody>
              {byClub.map((c) => (
                <tr key={c.name}>
                  <td>
                    <span className="row" style={{ flexWrap: 'nowrap' }}>
                      <TeamLogo src={c.logo} name={c.name} size={22} />
                      {c.ref ? <a href={href.club(c.ref, c.name, 'palmares')}>{c.name}</a> : c.name}
                    </span>
                  </td>
                  <td className="num">
                    <b>{c.titles.length}</b>
                  </td>
                  <td className="num">{c.runner}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Fuente: Wikipedia (CC BY-SA 4.0). Incluye la etapa de Liga Nacional (1957-1983).</p>
        </Section>
      </div>
    </div>
  )
}

function AllTime({ rows }: { rows: ClubRecordRow[] }) {
  const [scope, setScope] = useState<'acb' | 'total'>('acb')
  const list = rows.filter((r) => r.scope === scope && r.games)
  const columns: Column<ClubRecordRow>[] = [
    { key: 'position', label: '#', num: true, className: 'pos' },
    {
      key: 'name',
      label: 'Club',
      render: (r) => (
        <a className="team-link" href={href.club(r.club_ref, r.name, 'historia')}>
          <TeamLogo src={r.logo} name={r.name} size={24} />
          <span>{r.name}</span>
        </a>
      )
    },
    { key: 'seasons', label: 'Temp.', num: true, title: 'Temporadas disputadas' },
    { key: 'games', label: 'PJ', num: true, render: (r) => int(r.games) },
    { key: 'wins', label: 'V', num: true, render: (r) => int(r.wins) },
    { key: 'losses', label: 'D', num: true, render: (r) => int(r.losses) },
    { key: 'pctw', label: '%V', num: true, value: (r) => (r.wins ?? 0) / (r.games || 1), render: (r) => pct((100 * (r.wins ?? 0)) / (r.games || 1)) },
    { key: 'points_for', label: 'PF', num: true, render: (r) => int(r.points_for) },
    { key: 'points_against', label: 'PC', num: true, render: (r) => int(r.points_against) },
    { key: 'titles_liga', label: 'Ligas', num: true, render: (r) => (r.titles_liga ? <b>{r.titles_liga}</b> : '—') },
    { key: 'titles_copa', label: 'Copas', num: true, render: (r) => (r.titles_copa ? <b>{r.titles_copa}</b> : '—') },
    { key: 'titles_supercopa', label: 'Supercopas', num: true, render: (r) => (r.titles_supercopa ? <b>{r.titles_supercopa}</b> : '—') },
    { key: 'first_places', label: '1º', num: true, title: 'Veces 1º en la clasificación final (cuadro de honor ACB)', render: (r) => int(r.first_places) },
    { key: 'second_places', label: '2º', num: true, render: (r) => int(r.second_places) },
    { key: 'third_places', label: '3º', num: true, render: (r) => int(r.third_places) },
    { key: 'fourth_places', label: '4º', num: true, render: (r) => int(r.fourth_places) }
  ]
  return (
    <Section
      eyebrow="Desde 1956-57"
      title="Clasificación histórica"
      actions={
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { id: 'acb', label: 'Era ACB (1983-)' },
            { id: 'total', label: 'Liga Nacional + ACB' }
          ]}
        />
      }
    >
      {list.length ? (
        <DataTable rows={list} columns={columns} rowKey={(r) => r.club_ref} initialSort={{ key: 'position', dir: 'asc' }} limit={30} compact />
      ) : (
        <Empty>Sin datos históricos todavía.</Empty>
      )}
      <p className="note">
        Partidos, victorias, puntos y puestos: ranking de clubes y cuadro de honor de acb.com. Títulos: palmarés por temporadas
        (Wikipedia). Puede haber diferencias puntuales entre ambas fuentes en la temporada más reciente.
      </p>
    </Section>
  )
}
