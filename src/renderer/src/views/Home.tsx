import { useEffect, useRef, useState } from 'react'
import { LEADER_STATS, type EditionRow, type LeaderStat } from '../../../shared/api'
import { Loading, Logo, fmtDateTime, fmtNum, useLoad, type Navigate } from '../ui'

export function Home({
  edition,
  navigate,
  onSynced
}: {
  edition?: EditionRow
  navigate: Navigate
  onSynced: () => void
}) {
  return (
    <>
      <h1>{edition ? `${edition.competition_name} ${edition.season_label}` : 'D3 Basket'}</h1>
      <div className="sub">
        {edition
          ? `${edition.teams} equipos · ${edition.finished}/${edition.games} partidos jugados · ` +
            `última sincronización ${edition.last_synced_at ? fmtDateTime(edition.last_synced_at) : 'nunca'}`
          : 'Todavía no hay datos. Sincroniza la ACB para empezar.'}
      </div>
      {window.d3.platform === 'desktop' ? (
        <SyncPanel onSynced={onSynced} />
      ) : (
        <div className="panel web-note">
          Versión web: los datos de acb.com se actualizan automáticamente cada día en el servidor. Tus informes de
          scouting se guardan en este navegador (puedes exportarlos desde Scouting).
        </div>
      )}
      {edition && (
        <div className="grid-2">
          <Standings csId={edition.id} navigate={navigate} />
          <Leaders csId={edition.id} navigate={navigate} />
        </div>
      )}
    </>
  )
}

function SyncPanel({ onSynced }: { onSynced: () => void }) {
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [progress, setProgress] = useState<{ stage: string; done: number; total: number }>()
  const [season, setSeason] = useState('')
  const [bios, setBios] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      window.d3.onSyncProgress((e) => {
        if (e.log) setLines((l) => [...l.slice(-300), e.log!])
        else setProgress({ stage: e.stage, done: e.done, total: e.total })
      }),
    []
  )
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [lines])

  const run = async () => {
    setBusy(true)
    setLines([])
    const res = await window.d3.syncAcb({ season: season ? Number(season) : undefined, players: bios })
    setLines((l) => [...l, res.ok ? `✔ ${res.message}` : `✗ ${res.message}`])
    setBusy(false)
    setProgress(undefined)
    onSynced()
  }

  const stageLabel: Record<string, string> = {
    calendar: 'Calendario',
    rosters: 'Plantillas',
    players: 'Fichas de jugador',
    boxscores: 'Boxscores',
    schedules: 'Partidos por equipo',
    done: 'Terminado'
  }

  return (
    <div className="panel">
      <h2>Sincronizar ACB (acb.com)</h2>
      <div className="row">
        <select value={season} onChange={(e) => setSeason(e.target.value)} className="btn ghost" disabled={busy}>
          <option value="">Temporada en curso</option>
          {Array.from({ length: 10 }, (_, i) => 2025 - i).map((y) => (
            <option key={y} value={y}>
              Histórico {y}-{String(y + 1).slice(-2)}
            </option>
          ))}
        </select>
        <label className="row" style={{ color: 'var(--muted)' }}>
          <input type="checkbox" checked={bios} onChange={(e) => setBios(e.target.checked)} disabled={busy} />
          Fichas biográficas
        </label>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? 'Sincronizando…' : 'Sincronizar'}
        </button>
        {progress && progress.total > 0 && (
          <span className="chip">
            {stageLabel[progress.stage] ?? progress.stage} {progress.done}/{progress.total}
          </span>
        )}
      </div>
      {progress && progress.total > 0 && (
        <div className="progress">
          <div style={{ width: `${Math.round((100 * progress.done) / progress.total)}%` }} />
        </div>
      )}
      {lines.length > 0 && (
        <div className="sync-log" ref={logRef}>
          {lines.join('\n')}
        </div>
      )}
    </div>
  )
}

function Standings({ csId, navigate }: { csId: number; navigate: Navigate }) {
  const [rows, , error] = useLoad(() => window.d3.standings(csId), [csId])
  if (!rows) return <Loading error={error} />
  return (
    <div className="panel">
      <h2>Clasificación</h2>
      {rows.length === 0 ? (
        <div className="empty">Aún no se ha disputado ningún partido.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th className="num">PJ</th>
              <th className="num">G</th>
              <th className="num">P</th>
              <th className="num">PF</th>
              <th className="num">PC</th>
              <th className="num">+/−</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.team_id} className="clickable" onClick={() => navigate({ name: 'team', id: r.team_id })}>
                <td>{i + 1}</td>
                <td>
                  <div className="team-cell">
                    <Logo src={r.logo_url} />
                    {r.team_name}
                  </div>
                </td>
                <td className="num">{r.played}</td>
                <td className="num w">{r.won}</td>
                <td className="num l">{r.lost}</td>
                <td className="num">{r.points_for}</td>
                <td className="num">{r.points_against}</td>
                <td className="num">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Leaders({ csId, navigate }: { csId: number; navigate: Navigate }) {
  const [stat, setStat] = useState<LeaderStat>('pir')
  const [rows, , error] = useLoad(() => window.d3.leaders(csId, stat), [csId, stat])
  return (
    <div className="panel">
      <h2>Líderes</h2>
      <div className="rounds">
        {(Object.keys(LEADER_STATS) as LeaderStat[]).map((k) => (
          <button key={k} className={k === stat ? 'active' : ''} onClick={() => setStat(k)}>
            {LEADER_STATS[k]}
          </button>
        ))}
      </div>
      {!rows ? (
        <Loading error={error} />
      ) : rows.length === 0 ? (
        <div className="empty">Sin boxscores todavía.</div>
      ) : (
        <table>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.player_id} className="clickable" onClick={() => navigate({ name: 'player', id: r.player_id })}>
                <td>{i + 1}</td>
                <td>
                  <strong>{r.display_name}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.team_name}</div>
                </td>
                <td className="num">{r.games} PJ</td>
                <td className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                  {fmtNum(r.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
