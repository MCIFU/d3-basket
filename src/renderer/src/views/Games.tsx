import { useMemo, useState } from 'react'
import type { GameRow } from '../../../shared/api'
import { Loading, Logo, StatusChip, fmtDateTime, useLoad, type Navigate } from '../ui'

export function GameCard({ g, navigate }: { g: GameRow; navigate: Navigate }) {
  const played = g.home_score != null && g.away_score != null
  const homeWon = played && g.home_score! > g.away_score!
  return (
    <div
      className={`game-card ${g.has_boxscore ? 'clickable' : ''}`}
      onClick={() => g.has_boxscore && navigate({ name: 'game', id: g.id })}
      title={g.has_boxscore ? 'Ver boxscore' : undefined}
    >
      <div className="home">
        <a onClick={(e) => (e.stopPropagation(), navigate({ name: 'team', id: g.home_team_id }))}>{g.home_name}</a>
        <Logo src={g.home_logo} />
      </div>
      <div className="score">
        {played ? (
          <>
            <span className={homeWon ? 'w' : ''}>{g.home_score}</span> –{' '}
            <span className={!homeWon ? 'w' : ''}>{g.away_score}</span>
          </>
        ) : (
          <StatusChip status={g.status} />
        )}
        <span className="when">
          {g.round_name ? `${g.round_name} · ` : ''}
          {fmtDateTime(g.scheduled_at)}
        </span>
      </div>
      <div className="away">
        <Logo src={g.away_logo} />
        <a onClick={(e) => (e.stopPropagation(), navigate({ name: 'team', id: g.away_team_id }))}>{g.away_name}</a>
      </div>
    </div>
  )
}

export function Games({ csId, navigate, initialRound }: { csId: number; navigate: Navigate; initialRound?: number }) {
  const [games, , error] = useLoad(() => window.d3.games(csId), [csId])
  const rounds = useMemo(() => {
    const map = new Map<string, { key: string; label: string; games: GameRow[] }>()
    for (const g of games ?? []) {
      const key = `${g.phase ?? 'otros'}-${g.round_number ?? 0}`
      if (!map.has(key)) map.set(key, { key, label: g.phase === 'regular' ? String(g.round_number) : (g.round_name ?? '?'), games: [] })
      map.get(key)!.games.push(g)
    }
    return [...map.values()]
  }, [games])

  // Por defecto: la primera jornada con partidos pendientes (o la última).
  const defaultRound = useMemo(() => {
    if (initialRound != null) return `regular-${initialRound}`
    const next = rounds.find((r) => r.games.some((g) => g.status !== 'finished'))
    return (next ?? rounds[rounds.length - 1])?.key
  }, [rounds, initialRound])
  const [selected, setSelected] = useState<string>()
  const current = rounds.find((r) => r.key === (selected ?? defaultRound))

  if (!games) return <Loading error={error} />
  return (
    <>
      <h1>Calendario y resultados</h1>
      <div className="sub">Pulsa un partido jugado para ver su boxscore.</div>
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
      {current ? current.games.map((g) => <GameCard key={g.id} g={g} navigate={navigate} />) : <div className="empty">Sin partidos.</div>}
    </>
  )
}
