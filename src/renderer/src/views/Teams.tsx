import { GameCard } from './Games'
import { Loading, Logo, age, fmtNum, useLoad, type Navigate } from '../ui'

export function Teams({ csId, navigate }: { csId: number; navigate: Navigate }) {
  const [teams, , error] = useLoad(() => window.d3.teams(csId), [csId])
  if (!teams) return <Loading error={error} />
  return (
    <>
      <h1>Equipos</h1>
      <div className="sub">{teams[0]?.season_label}</div>
      <div className="team-tiles">
        {teams.map((t) => (
          <div
            key={t.id}
            className="team-tile"
            style={{ borderLeftColor: t.primary_color ?? undefined }}
            onClick={() => navigate({ name: 'team', id: t.id })}
          >
            <Logo src={t.logo_url} />
            <div>
              <strong>{t.name}</strong>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t.abbreviation}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

const LICENSE: Record<string, string> = {
  JFL: 'Formación local',
  EUR: 'Comunitario',
  EXT: 'Extracomunitario',
  COT: 'Cotonú'
}

export function Team({ id, navigate }: { id: number; navigate: Navigate }) {
  const [data, , error] = useLoad(() => window.d3.team(id), [id])
  if (!data) return <Loading error={error} />
  const { team, roster, staff, games } = data
  const played = games.filter((g) => g.home_score != null)
  const wins = played.filter((g) =>
    g.home_team_id === id ? g.home_score! > g.away_score! : g.away_score! > g.home_score!
  ).length

  return (
    <>
      <div className="player-head panel" style={{ borderTop: `4px solid ${team.primary_color ?? 'var(--accent)'}` }}>
        <Logo src={team.logo_url} big />
        <div>
          <h1>{team.name}</h1>
          <div className="sub" style={{ margin: 0 }}>
            {team.season_label} · {wins}-{played.length - wins} ·{' '}
            {staff.filter((s) => s.role === 'head_coach').map((s) => s.name).join(', ') || 'Entrenador —'}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Plantilla</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th>Pos.</th>
                <th>Licencia</th>
                <th>Nacionalidad</th>
                <th className="num">Edad</th>
                <th className="num">Altura</th>
                <th className="num">PJ</th>
                <th className="num">PTS</th>
                <th className="num">REB</th>
                <th className="num">AST</th>
                <th className="num">VAL</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr
                  key={p.player_id}
                  className={`clickable ${p.is_active ? '' : 'inactive'}`}
                  onClick={() => navigate({ name: 'player', id: p.player_id })}
                  title={p.is_active ? undefined : 'Baja'}
                >
                  <td>{p.jersey_number}</td>
                  <td>
                    <strong>{p.display_name}</strong> {!p.is_active && <span className="chip loss">baja</span>}
                  </td>
                  <td>{p.position}</td>
                  <td title={LICENSE[p.license_type ?? ''] ?? undefined}>{p.license_type}</td>
                  <td>{p.nationality}</td>
                  <td className="num">{age(p.birth_date) ?? '—'}</td>
                  <td className="num">{p.height_cm ? `${p.height_cm} cm` : '—'}</td>
                  <td className="num">{p.games ?? 0}</td>
                  <td className="num">{fmtNum(p.ppg)}</td>
                  <td className="num">{fmtNum(p.rpg)}</td>
                  <td className="num">{fmtNum(p.apg)}</td>
                  <td className="num">{fmtNum(p.pir)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {staff.length > 0 && (
          <div style={{ marginTop: 14, color: 'var(--muted)' }}>
            Cuerpo técnico:{' '}
            {staff.map((s) => `${s.name}${s.role === 'head_coach' ? ' (principal)' : ''}`).join(' · ')}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Partidos</h2>
        {games.map((g) => (
          <GameCard key={g.id} g={g} navigate={navigate} />
        ))}
      </div>
    </>
  )
}
