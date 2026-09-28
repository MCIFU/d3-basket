import type { BoxLine, GameDetail } from '../../../shared/api'
import { Loading, fmtDateTime, fmtMin, shot, useLoad, type Navigate } from '../ui'

export function Game({ id, navigate }: { id: number; navigate: Navigate }) {
  const [data, , error] = useLoad(() => window.d3.game(id), [id])
  if (!data) return <Loading error={error} />
  const { game: g, periods, teams } = data
  const periodLabel = (p: number) => (p <= 4 ? `${p}C` : `PR${p - 4}`)

  return (
    <>
      <div className="panel">
        <div className="scoreboard">
          <div>
            <a onClick={() => navigate({ name: 'team', id: g.home_team_id })}>
              <h1>{g.home_name}</h1>
            </a>
            <span className="chip">Local</span>
          </div>
          <div>
            <div className="big">
              {g.home_score ?? '–'} : {g.away_score ?? '–'}
            </div>
            <div style={{ color: 'var(--muted)' }}>
              {g.round_name} · {fmtDateTime(g.scheduled_at)}
            </div>
          </div>
          <div>
            <a onClick={() => navigate({ name: 'team', id: g.away_team_id })}>
              <h1>{g.away_name}</h1>
            </a>
            <span className="chip">Visitante</span>
          </div>
        </div>
        {periods.length > 0 && (
          <table style={{ maxWidth: 520, margin: '18px auto 0' }}>
            <thead>
              <tr>
                <th />
                {periods.map((p) => (
                  <th key={p.period} className="num">
                    {periodLabel(p.period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{g.home_abbr}</td>
                {periods.map((p) => (
                  <td key={p.period} className="num">
                    {p.home_points}
                  </td>
                ))}
              </tr>
              <tr>
                <td>{g.away_abbr}</td>
                {periods.map((p) => (
                  <td key={p.period} className="num">
                    {p.away_points}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 14, fontSize: 13 }}>
          {[g.arena, g.attendance ? `${g.attendance.toLocaleString('es-ES')} espectadores` : null, g.referees.length ? `Árbitros: ${g.referees.join(', ')}` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {teams.map((t) => (
        <BoxTable key={t.team_id} team={t} navigate={navigate} />
      ))}
    </>
  )
}

function BoxTable({ team, navigate }: { team: GameDetail['teams'][number]; navigate: Navigate }) {
  const row = (l: Partial<BoxLine>) => (
    <>
      <td className="num">{l.points}</td>
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
    <div className="panel">
      <h2>
        {team.name} {team.head_coach && <span style={{ color: 'var(--muted)', textTransform: 'none' }}>· {team.head_coach}</span>}
      </h2>
      <div className="table-scroll">
        <table>
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
              <th className="num">PER</th>
              <th className="num">TAP</th>
              <th className="num">FP</th>
              <th className="num">+/−</th>
              <th className="num">VAL</th>
            </tr>
          </thead>
          <tbody>
            {team.lines.map((l) => (
              <tr key={l.player_id} className={`clickable ${l.seconds === 0 ? 'inactive' : ''}`} onClick={() => navigate({ name: 'player', id: l.player_id })}>
                <td>{l.jersey_number}</td>
                <td>
                  {l.is_starter ? <strong>{l.display_name}</strong> : l.display_name}
                  {l.is_starter ? <span style={{ color: 'var(--accent)' }}> *</span> : null}
                </td>
                <td className="num">{l.seconds ? fmtMin(l.seconds) : 'DNP'}</td>
                {row(l)}
                <td className="num">{l.plus_minus ?? ''}</td>
                <td className="num">
                  <strong>{l.pir ?? ''}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total</td>
              <td />
              {row(team.total)}
              <td />
              <td className="num">{team.total.pir}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
