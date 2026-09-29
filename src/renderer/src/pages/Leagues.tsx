import { useMemo, useState } from 'react'
import type { ClubRecordRow, GameRow, HonourRow, LeagueData, StandingRow } from '../../../shared/api'
import {
  CompetitionBadge,
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
import { int, num, pct, signed } from '../format'
import { href, navigate } from '../router'
import { LeadersBox } from './Home'
import { PlayerStatsTable, TeamStatsTable } from './StatTables'

export function LeaguesPage() {
  const [comps, error] = useLoad(() => window.d3.competitions(), [])
  if (!comps) return <Loading error={error} />
  const meta: Record<string, { tier: string; sub: string }> = {
    ACB: { tier: 'Primera división · ACB', sub: 'Liga Endesa' },
    LEB_ORO: { tier: 'Segunda división · FEB', sub: 'Primera FEB' },
    LEB_PLATA: { tier: 'Tercera división · FEB', sub: 'Segunda FEB' }
  }
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Competiciones</div>
        <h1>Ligas</h1>
        <p>Baloncesto profesional y semiprofesional español.</p>
      </div>
      <div className="grid grid-3">
        {comps.map((c) =>
          c.editions > 0 ? (
            <a key={c.code} className="league-card" href={href.league(c.code)}>
              <div className="tier">{meta[c.code]?.tier}</div>
              <h3>{c.name}</h3>
              <div className="muted">Temporada {c.current_label}</div>
              <div className="row" style={{ marginTop: 12 }}>
                <span className="chip brand">
                  {c.editions} temporada{c.editions === 1 ? '' : 's'} con datos
                </span>
              </div>
              {c.code === 'ACB' && <Trophy competition="liga" size={92} />}
            </a>
          ) : (
            <div key={c.code} className="league-card soon">
              <div className="tier">{meta[c.code]?.tier}</div>
              <h3>{c.short_name ?? c.name}</h3>
              <div className="muted">{c.name}</div>
              <div className="row" style={{ marginTop: 12 }}>
                <span className="chip">Próximamente</span>
              </div>
            </div>
          )
        )}
      </div>
    </>
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

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-logo" style={{ background: 'linear-gradient(160deg, #fff, #f1f5f9)' }}>
            {code === 'ACB' ? <Trophy competition="liga" size={96} /> : <CompetitionBadge name={code} />}
          </div>
          <div>
            <div className="eyebrow">
              {competition.organizer} · {code === 'ACB' ? 'Primera división' : code === 'LEB_ORO' ? 'Segunda división (LEB Oro)' : 'Tercera división (LEB Plata)'}
            </div>
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
                <StatTile label="Espectadores" value={int(attendance)} />
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
          <StandingsTable rows={data.standings} year={selectedYear} />
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
    </>
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
          <StandingsTable rows={data.standings} compact year={data.edition?.start_year} />
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

export function StandingsTable({ rows, compact, year }: { rows: StandingRow[]; compact?: boolean; year?: number }) {
  if (!rows.length) return <Empty>Aún no se ha disputado ningún partido.</Empty>
  const columns: Column<StandingRow>[] = [
    { key: 'position', label: '#', num: true, className: 'pos' },
    { key: 'team', label: 'Equipo', value: (r) => r.name, render: (r) => <TeamLink team={r} year={year} /> },
    { key: 'played', label: 'PJ', num: true },
    { key: 'won', label: 'V', num: true },
    { key: 'lost', label: 'D', num: true },
    ...(compact
      ? []
      : [
          { key: 'win_pct', label: '%V', num: true, value: (r: StandingRow) => r.won / (r.played || 1), render: (r: StandingRow) => pct((100 * r.won) / (r.played || 1)) },
          { key: 'points_for', label: 'PF', num: true, title: 'Puntos a favor' },
          { key: 'points_against', label: 'PC', num: true, title: 'Puntos en contra' }
        ]),
    { key: 'diff', label: '+/−', num: true, render: (r) => signed(r.diff) },
    { key: 'form', label: 'Últimos 5', value: (r) => r.form.filter((f) => f === 'W').length, render: (r) => <Form results={r.form} /> }
  ]
  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.team_id} initialSort={{ key: 'position', dir: 'asc' }} compact={compact} />
}

function Results({ games }: { games: GameRow[] }) {
  const rounds = useMemo(() => {
    const map = new Map<string, { key: string; label: string; games: GameRow[] }>()
    for (const g of games) {
      const key = `${g.phase ?? 'x'}-${g.round_number ?? 0}`
      if (!map.has(key)) map.set(key, { key, label: g.phase === 'regular' ? String(g.round_number) : (g.round_name ?? '?'), games: [] })
      map.get(key)!.games.push(g)
    }
    return [...map.values()]
  }, [games])
  const initial = rounds.find((r) => r.games.some((g) => g.status !== 'finished')) ?? rounds[rounds.length - 1]
  const [selected, setSelected] = useState<string>()
  const current = rounds.find((r) => r.key === (selected ?? initial?.key))
  if (!rounds.length) return <Empty>Sin calendario.</Empty>
  return (
    <Section title={current?.games[0]?.round_name ?? 'Jornada'} eyebrow="Calendario">
      <div className="rounds">
        {rounds.map((r) => (
          <button
            key={r.key}
            className={`${r.key === current?.key ? 'active' : ''} ${r.games.every((g) => g.status === 'finished') ? 'played' : ''}`}
            onClick={() => setSelected(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="games-grid">
        {current?.games.map((g) => (
          <GameCard key={g.id} g={g} />
        ))}
      </div>
      <p className="note">Pulsa un partido jugado para ver su estadística completa.</p>
    </Section>
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
