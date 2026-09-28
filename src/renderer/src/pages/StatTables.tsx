import { useMemo, useState } from 'react'
import type { PlayerStatRow, StatBlock, TeamStatRow } from '../../../shared/api'
import { DataTable, PlayerPhoto, Segmented, TeamLink, type Column } from '../components'
import { int, num, pct, shot } from '../format'
import { href } from '../router'

export type StatMode = 'avg' | 'tot'

/** Columna numérica que muestra media o total según el modo. */
function statCol<T extends StatBlock>(key: string, label: string, avgKey: keyof StatBlock, totKey: keyof StatBlock, mode: StatMode, title?: string): Column<T> {
  const k = mode === 'avg' ? avgKey : totKey
  return {
    key,
    label,
    title,
    num: true,
    value: (r) => r[k] as number,
    render: (r) => (mode === 'avg' ? num(r[k] as number) : int(r[k] as number))
  }
}

function shootingCols<T extends StatBlock>(mode: StatMode): Column<T>[] {
  const made = (m: keyof StatBlock, a: keyof StatBlock) => (r: T) =>
    mode === 'avg' ? `${num((r[m] as number) / (r.games || 1))}/${num((r[a] as number) / (r.games || 1))}` : shot(r[m] as number, r[a] as number)
  return [
    { key: 'fg2', label: 'T2', title: 'Tiros de 2 anotados/intentados', num: true, value: (r) => r.fg2m, render: made('fg2m', 'fg2a') },
    { key: 'fg2_pct', label: 'T2%', num: true, value: (r) => r.fg2_pct, render: (r) => pct(r.fg2_pct) },
    { key: 'fg3', label: 'T3', title: 'Triples anotados/intentados', num: true, value: (r) => r.fg3m, render: made('fg3m', 'fg3a') },
    { key: 'fg3_pct', label: 'T3%', num: true, value: (r) => r.fg3_pct, render: (r) => pct(r.fg3_pct) },
    { key: 'ft', label: 'TL', title: 'Tiros libres anotados/intentados', num: true, value: (r) => r.ftm, render: made('ftm', 'fta') },
    { key: 'ft_pct', label: 'TL%', num: true, value: (r) => r.ft_pct, render: (r) => pct(r.ft_pct) },
    { key: 'ts_pct', label: 'TS%', title: 'True Shooting: PTS / (2 × (TCI + 0,44 × TLI))', num: true, value: (r) => r.ts_pct, render: (r) => pct(r.ts_pct) },
    { key: 'efg_pct', label: 'eFG%', title: 'Tiro de campo efectivo', num: true, value: (r) => r.efg_pct, render: (r) => pct(r.efg_pct) }
  ]
}

export function ModeToggle({ mode, onChange }: { mode: StatMode; onChange: (m: StatMode) => void }) {
  return (
    <Segmented
      value={mode}
      onChange={onChange}
      options={[
        { id: 'avg', label: 'Por partido' },
        { id: 'tot', label: 'Totales' }
      ]}
    />
  )
}

export function PlayerStatsTable({ rows, showTeam = true, filters = true }: { rows: PlayerStatRow[]; showTeam?: boolean; filters?: boolean }) {
  const [mode, setMode] = useState<StatMode>('avg')
  const [q, setQ] = useState('')
  const [position, setPosition] = useState('')
  const maxGames = Math.max(0, ...rows.map((r) => r.games))
  const [minGames, setMinGames] = useState<number | null>(null)
  const effectiveMin = minGames ?? (filters ? Math.ceil(maxGames / 2) : 0)

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.games >= effectiveMin &&
          (!position || r.position === position) &&
          (!q || r.display_name.toLowerCase().includes(q.toLowerCase()) || r.team.name.toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, effectiveMin, position, q]
  )
  const positions = [...new Set(rows.map((r) => r.position).filter(Boolean))] as string[]

  const columns: Column<PlayerStatRow>[] = [
    {
      key: 'player',
      label: 'Jugador',
      value: (r) => r.display_name,
      render: (r) => (
        <a className="player-cell" href={href.player(r.player_ref, r.display_name)}>
          <PlayerPhoto nobg={r.photo_nobg} photo={r.photo} name={r.display_name} color={r.team.color} size={34} />
          <span style={{ minWidth: 0 }}>
            <div className="name">{r.display_name}</div>
            <div className="sub">{r.position ?? ''}</div>
          </span>
        </a>
      )
    },
    ...(showTeam
      ? [{ key: 'team', label: 'Equipo', value: (r: PlayerStatRow) => r.team.name, render: (r: PlayerStatRow) => <TeamLink team={r.team} short /> }]
      : []),
    { key: 'games', label: 'PJ', num: true, title: 'Partidos jugados' },
    { key: 'starts', label: 'TIT', num: true, title: 'Partidos como titular' },
    {
      key: 'min',
      label: 'MIN',
      num: true,
      value: (r) => (mode === 'avg' ? r.mpg : r.seconds),
      render: (r) => (mode === 'avg' ? num(r.mpg) : int(r.seconds / 60))
    },
    statCol('pts', 'PTS', 'ppg', 'pts', mode, 'Puntos'),
    statCol('reb', 'REB', 'rpg', 'reb', mode, 'Rebotes'),
    statCol('oreb', 'RO', 'orpg', 'oreb', mode, 'Rebotes ofensivos'),
    statCol('dreb', 'RD', 'drpg', 'dreb', mode, 'Rebotes defensivos'),
    statCol('ast', 'AST', 'apg', 'ast', mode, 'Asistencias'),
    statCol('stl', 'ROB', 'spg', 'stl', mode, 'Robos'),
    statCol('blk', 'TAP', 'bpg', 'blk', mode, 'Tapones'),
    statCol('tov', 'PÉR', 'tpg', 'tov', mode, 'Pérdidas'),
    statCol('pf', 'FP', 'pfpg', 'pf', mode, 'Faltas personales'),
    statCol('pm', '+/−', 'pmpg', 'pm', mode, 'Diferencia de puntos con el jugador en pista'),
    statCol('pir', 'VAL', 'pirpg', 'pir', mode, 'Valoración'),
    ...shootingCols<PlayerStatRow>(mode)
  ]

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <ModeToggle mode={mode} onChange={setMode} />
        {filters && (
          <>
            <input className="input" placeholder="Filtrar por nombre o equipo" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">Todas las posiciones</option>
              {positions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <label className="row small muted">
              Mín. partidos
              <input
                className="input"
                type="number"
                min={0}
                max={maxGames}
                style={{ width: 72 }}
                value={effectiveMin}
                onChange={(e) => setMinGames(Number(e.target.value))}
              />
            </label>
            <span className="small muted">{visible.length} jugadores</span>
          </>
        )}
      </div>
      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => `${r.player_id}-${r.team.team_id}`}
        initialSort={{ key: 'pir', dir: 'desc' }}
        limit={filters ? 50 : undefined}
      />
    </>
  )
}

export function TeamStatsTable({ rows }: { rows: TeamStatRow[] }) {
  const [mode, setMode] = useState<StatMode>('avg')
  const columns: Column<TeamStatRow>[] = [
    { key: 'team', label: 'Equipo', value: (r) => r.team.name, render: (r) => <TeamLink team={r.team} /> },
    { key: 'games', label: 'PJ', num: true },
    { key: 'wins', label: 'V', num: true, title: 'Victorias' },
    { key: 'losses', label: 'D', num: true, title: 'Derrotas' },
    statCol('pts', 'PTS', 'ppg', 'pts', mode, 'Puntos anotados'),
    {
      key: 'opp',
      label: 'PTS C.',
      title: 'Puntos recibidos',
      num: true,
      value: (r) => (mode === 'avg' ? r.opp_ppg : r.opp_pts),
      render: (r) => (mode === 'avg' ? num(r.opp_ppg) : int(r.opp_pts))
    },
    {
      key: 'diff',
      label: 'DIF',
      num: true,
      value: (r) => r.diff_pg,
      render: (r) => (mode === 'avg' ? num(r.diff_pg) : int(r.pts - r.opp_pts))
    },
    statCol('reb', 'REB', 'rpg', 'reb', mode, 'Rebotes'),
    statCol('oreb', 'RO', 'orpg', 'oreb', mode, 'Rebotes ofensivos'),
    statCol('dreb', 'RD', 'drpg', 'dreb', mode, 'Rebotes defensivos'),
    statCol('ast', 'AST', 'apg', 'ast', mode, 'Asistencias'),
    statCol('stl', 'ROB', 'spg', 'stl', mode, 'Robos'),
    statCol('blk', 'TAP', 'bpg', 'blk', mode, 'Tapones'),
    statCol('tov', 'PÉR', 'tpg', 'tov', mode, 'Pérdidas'),
    statCol('pf', 'FP', 'pfpg', 'pf', mode, 'Faltas'),
    statCol('pir', 'VAL', 'pirpg', 'pir', mode, 'Valoración'),
    ...shootingCols<TeamStatRow>(mode),
    {
      key: 'att',
      label: 'Espect.',
      title: mode === 'avg' ? 'Media de espectadores en casa' : 'Espectadores totales en casa',
      num: true,
      value: (r) => (mode === 'avg' ? r.attendance_avg : r.attendance_total),
      render: (r) => int(mode === 'avg' ? r.attendance_avg : r.attendance_total)
    },
    { key: 'att_max', label: 'Máx.', title: 'Mayor entrada de la temporada', num: true, value: (r) => r.attendance_max, render: (r) => int(r.attendance_max) }
  ]
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.team.team_id} initialSort={{ key: 'pts', dir: 'desc' }} />
    </>
  )
}
