import type { BoxLine, GameDetail } from '../../../shared/api'
import { Empty, Loading, Minutes, Section, TeamLogo, useLoad } from '../components'
import { fmtDateTime, int, shot, signed } from '../format'
import { href } from '../router'

export function GamePage({ refId }: { refId: string }) {
  const [data, error] = useLoad(() => window.d3.game(refId), [refId])
  if (error) return <Loading error={error} />
  if (data === undefined) return <Loading />
  if (!data) return <Empty>No se ha encontrado este partido.</Empty>
  const { game: g, periods, teams } = data
  const played = g.home_score != null && g.away_score != null
  const homeWon = played && g.home_score! > g.away_score!
  const periodLabel = (p: number) => (p <= 4 ? `${p}º` : `PR${p - 4}`)

  return (
    <>
      <section className="hero">
        <div className="row small" style={{ justifyContent: 'center', opacity: 0.8, marginBottom: 18 }}>
          <a className="link" href={href.league('ACB', 'resultados', undefined)}>
            Liga Endesa {g.season_label}
          </a>
          <span>·</span>
          <span>{g.round_name}</span>
          <span>·</span>
          <span>{fmtDateTime(g.scheduled_at)}</span>
        </div>
        <div className="scoreboard">
          {[g.home, g.away].map((t, i) => (
            <a key={t.team_id} className="team" href={href.club(t.club_ref, t.name)} style={{ order: i === 0 ? 0 : 2 }}>
              <span className="hero-logo" style={{ width: 96, height: 96 }}>
                <TeamLogo src={t.logo} name={t.name} size={72} />
              </span>
              {t.name}
              <span className="chip">{i === 0 ? 'Local' : 'Visitante'}</span>
            </a>
          ))}
          <div className="score" style={{ order: 1 }}>
            {played ? (
              <>
                <span className={homeWon ? '' : 'lost'}>{g.home_score}</span>
                <span style={{ opacity: 0.4 }}> – </span>
                <span className={homeWon ? 'lost' : ''}>{g.away_score}</span>
              </>
            ) : (
              <span style={{ fontSize: 28 }}>vs</span>
            )}
          </div>
        </div>
        {periods.length > 0 && (
          <div className="quarters">
            <table className="table compact">
              <thead>
                <tr>
                  <th />
                  {periods.map((p) => (
                    <th key={p.period}>{periodLabel(p.period)}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{g.home.abbr}</td>
                  {periods.map((p) => (
                    <td key={p.period}>{p.home_points}</td>
                  ))}
                  <td>
                    <b>{g.home_score}</b>
                  </td>
                </tr>
                <tr>
                  <td>{g.away.abbr}</td>
                  {periods.map((p) => (
                    <td key={p.period}>{p.away_points}</td>
                  ))}
                  <td>
                    <b>{g.away_score}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="row small" style={{ justifyContent: 'center', opacity: 0.8, marginTop: 16 }}>
          {[g.arena, g.attendance ? `${int(g.attendance)} espectadores` : null, g.referees.length ? `Árbitros: ${g.referees.join(', ')}` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </section>

      {teams.every((t) => !t.lines.length) ? (
        <Section>
          <Empty>La estadística estará disponible cuando se juegue el partido.</Empty>
        </Section>
      ) : (
        <div className="stack">
          {teams.map((t) => (
            <BoxTable key={t.team.team_id} team={t} />
          ))}
        </div>
      )}
    </>
  )
}

function BoxTable({ team }: { team: GameDetail['teams'][number] }) {
  const cells = (l: Partial<BoxLine>) => (
    <>
      <td className="num">
        <b>{l.points}</b>
      </td>
      <td className="num">{shot(l.fg2m ?? 0, l.fg2a ?? 0)}</td>
      <td className="num">{shot(l.fg3m ?? 0, l.fg3a ?? 0)}</td>
      <td className="num">{shot(l.ftm ?? 0, l.fta ?? 0)}</td>
      <td className="num">{l.oreb}</td>
      <td className="num">{l.dreb}</td>
      <td className="num">{l.reb}</td>
      <td className="num">{l.ast}</td>
      <td className="num">{l.stl}</td>
      <td className="num">{l.tov}</td>
      <td className="num">{l.blk}</td>
      <td className="num">{l.pf}</td>
    </>
  )
  return (
    <Section
      title={
        <a className="team-link" href={href.club(team.team.club_ref, team.team.name)}>
          <TeamLogo src={team.team.logo} name={team.team.name} size={28} />
          <span>{team.team.name}</span>
        </a>
      }
      actions={team.head_coach ? <span className="muted">Entrenador: {team.head_coach}</span> : undefined}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th className="num">MIN</th>
              <th className="num">PTS</th>
              <th className="num">T2</th>
              <th className="num">T3</th>
              <th className="num">TL</th>
              <th className="num">RO</th>
              <th className="num">RD</th>
              <th className="num">REB</th>
              <th className="num">AST</th>
              <th className="num">ROB</th>
              <th className="num">PÉR</th>
              <th className="num">TAP</th>
              <th className="num">FP</th>
              <th className="num">+/−</th>
              <th className="num">VAL</th>
            </tr>
          </thead>
          <tbody>
            {team.lines.map((l) => (
              <tr key={l.player_id} className={l.seconds === 0 ? 'dim' : ''}>
                <td className="muted">{l.jersey_number}</td>
                <td>
                  <a className="player-link" href={href.player(l.player_ref, l.display_name)}>
                    {l.display_name}
                  </a>
                  {l.is_starter ? <span style={{ color: 'var(--brand)', fontWeight: 800 }}> ·</span> : null}
                </td>
                <td className="num">
                  <Minutes seconds={l.seconds} />
                </td>
                {cells(l)}
                <td className="num">{signed(l.plus_minus)}</td>
                <td className="num">
                  <b>{l.pir ?? '—'}</b>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total equipo</td>
              <td />
              {cells(team.total)}
              <td />
              <td className="num">{team.total.pir}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="note">· titular. Pulsa un jugador para ver su ficha.</p>
    </Section>
  )
}
