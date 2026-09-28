import type { ScoutingReport } from '../../../shared/api'
import { Loading, age, fmtDate, fmtMin, fmtNum, fmtPct, shot, useLoad, type Navigate } from '../ui'

export function Player({ id, navigate }: { id: number; navigate: Navigate }) {
  const [data, , error] = useLoad(() => window.d3.player(id), [id])
  if (!data) return <Loading error={error} />
  const { player: p, seasons, gameLog, reports } = data
  const current = seasons[0]

  const facts: [string, string | number | undefined | null][] = [
    ['Posición', p.position],
    ['Altura', p.height_cm ? `${p.height_cm} cm` : null],
    ['Nacimiento', p.birth_date ? `${new Date(p.birth_date).toLocaleDateString('es-ES')} (${age(p.birth_date)} años)` : null],
    ['Lugar', [p.birth_place, p.birth_country].filter(Boolean).join(', ') || null],
    ['Nacionalidad', p.nationality],
    ['Equipo', current ? `${current.team_name} (${current.season_label})` : null],
    ['Dorsal', current?.jersey_number],
    ['Nombre completo', p.full_name !== p.display_name ? p.full_name : null]
  ]

  return (
    <>
      <div className="panel player-head">
        {p.photo_url ? <img className="player-photo" src={p.photo_url} alt="" /> : <div className="player-photo" />}
        <div style={{ flex: 1 }}>
          <h1>{p.display_name}</h1>
          <div className="facts">
            {facts
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => (
                <div className="fact" key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </div>
              ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => navigate({ name: 'report', playerId: p.id })}>
              + Informe de scouting
            </button>
            {p.acb_url && (
              <button className="btn ghost" onClick={() => window.d3.openExternal(p.acb_url!)}>
                Ficha en acb.com ↗
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Trayectoria y medias por temporada</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Temporada</th>
                <th>Liga</th>
                <th>Equipo</th>
                <th className="num">PJ</th>
                <th className="num">MIN</th>
                <th className="num">PTS</th>
                <th className="num">REB</th>
                <th className="num">AST</th>
                <th className="num">ROB</th>
                <th className="num">TAP</th>
                <th className="num">T2%</th>
                <th className="num">T3%</th>
                <th className="num">TL%</th>
                <th className="num">TS%</th>
                <th className="num">eFG%</th>
                <th className="num">VAL</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.team_id} className="clickable" onClick={() => navigate({ name: 'team', id: s.team_id })}>
                  <td>{s.season_label}</td>
                  <td>{s.competition_code}</td>
                  <td>
                    {s.team_name} {!s.is_active && <span className="chip loss">baja</span>}
                  </td>
                  <td className="num">{s.games ?? 0}</td>
                  <td className="num">{fmtNum(s.mpg)}</td>
                  <td className="num">{fmtNum(s.ppg)}</td>
                  <td className="num">{fmtNum(s.rpg)}</td>
                  <td className="num">{fmtNum(s.apg)}</td>
                  <td className="num">{fmtNum(s.spg)}</td>
                  <td className="num">{fmtNum(s.bpg)}</td>
                  <td className="num">{fmtPct(s.fg2_pct)}</td>
                  <td className="num">{fmtPct(s.fg3_pct)}</td>
                  <td className="num">{fmtPct(s.ft_pct)}</td>
                  <td className="num">{fmtPct(s.ts_pct)}</td>
                  <td className="num">{fmtPct(s.efg_pct)}</td>
                  <td className="num">{fmtNum(s.pir)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Partido a partido</h2>
          {gameLog.length === 0 ? (
            <div className="empty">Sin partidos registrados todavía.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Rival</th>
                    <th>Res.</th>
                    <th className="num">MIN</th>
                    <th className="num">PTS</th>
                    <th className="num">T2</th>
                    <th className="num">T3</th>
                    <th className="num">TL</th>
                    <th className="num">REB</th>
                    <th className="num">AST</th>
                    <th className="num">VAL</th>
                  </tr>
                </thead>
                <tbody>
                  {gameLog.map((g) => {
                    const won = (g.team_score ?? 0) > (g.opp_score ?? 0)
                    return (
                      <tr key={g.game_id} className="clickable" onClick={() => navigate({ name: 'game', id: g.game_id })}>
                        <td>{fmtDate(g.scheduled_at)}</td>
                        <td>
                          {g.is_home ? 'vs' : '@'} {g.opponent}
                        </td>
                        <td className={won ? 'w' : 'l'}>
                          {won ? 'V' : 'D'} {g.team_score}-{g.opp_score}
                        </td>
                        <td className="num">{g.seconds ? fmtMin(g.seconds) : 'DNP'}</td>
                        <td className="num">{g.points}</td>
                        <td className="num">{shot(g.fg2m, g.fg2a)}</td>
                        <td className="num">{shot(g.fg3m, g.fg3a)}</td>
                        <td className="num">{shot(g.ftm, g.fta)}</td>
                        <td className="num">{g.reb}</td>
                        <td className="num">{g.ast}</td>
                        <td className="num">{g.pir}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Informes de scouting</h2>
          {reports.length === 0 ? (
            <div className="empty">Sin informes. Crea el primero.</div>
          ) : (
            reports.map((r) => <ReportCard key={r.id} r={r} onEdit={() => navigate({ name: 'report', playerId: p.id, reportId: r.id })} />)
          )}
        </div>
      </div>
    </>
  )
}

export function ReportCard({ r, onEdit, showPlayer }: { r: ScoutingReport; onEdit: () => void; showPlayer?: boolean }) {
  const rec: Record<string, string> = { fichar: 'win', seguir: 'accent', descartar: 'loss' }
  return (
    <div className="report">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>
          {showPlayer ? `${r.player_name} · ` : ''}
          {r.role || r.archetype || 'Informe'}
        </h3>
        <div className="row">
          {r.recommendation && <span className={`chip ${rec[r.recommendation]}`}>{r.recommendation}</span>}
          {r.current_level != null && <span className="chip">Nivel {r.current_level}/10</span>}
          {r.potential != null && <span className="chip accent">Potencial {r.potential}/10</span>}
          <button className="btn ghost" onClick={onEdit}>
            Editar
          </button>
        </div>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        {r.report_date} {r.author ? `· ${r.author}` : ''}
      </div>
      {r.strengths && (
        <p>
          <span className="label">Fortalezas · </span>
          {r.strengths}
        </p>
      )}
      {r.weaknesses && (
        <p>
          <span className="label">Debilidades · </span>
          {r.weaknesses}
        </p>
      )}
      {r.comparables && (
        <p>
          <span className="label">Comparables · </span>
          {r.comparables}
        </p>
      )}
      {r.projection && (
        <p>
          <span className="label">Proyección · </span>
          {r.projection}
        </p>
      )}
      {!!r.ratings?.length && (
        <div className="ratings" style={{ marginTop: 8 }}>
          {r.ratings.map((rt) => (
            <div key={rt.attribute} className="rating-row">
              <span>{rt.attribute}</span>
              <div className="bar">
                <div style={{ width: `${rt.score * 10}%` }} />
              </div>
              <strong>{rt.score}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
