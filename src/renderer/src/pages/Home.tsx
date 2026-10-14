import { useState } from 'react'
import type { HomeData, LeaderRow } from '../../../shared/api'
import {
  CourtPlayer,
  Empty,
  HalfCourt,
  GameCard,
  Loading,
  PlayerPhoto,
  Section,
  Segmented,
  TROPHIES,
  TeamLogo,
  Trophy,
  useLoad
} from '../components'
import { int, num } from '../format'
import { href } from '../router'
import { LeagueCard, StandingsTable } from './Leagues'

export function HomePage() {
  const [data, error] = useLoad(() => window.d3.home(), [])
  if (!data) return <Loading error={error} />
  const { edition, champions } = data
  const liga = champions.find((c) => c.competition === 'liga')

  return (
    <>
      {edition && data.lastRound ? (
        <HomeBoard data={data} />
      ) : (
        <section className="hero home-hero">
          <div>
            <div className="eyebrow">Scouting y estadística</div>
            <h1>El baloncesto español, en datos.</h1>
          </div>
        </section>
      )}
      {liga && (
        <div className="champion-strip">
          <Trophy competition="liga" size={54} />
          <div>
            <div className="eyebrow">Vigente campeón de Liga · {liga.label}</div>
            <div className="row" style={{ gap: 8, fontWeight: 700 }}>
              <TeamLogo src={liga.champion_logo} name={liga.champion_name} size={24} />
              {liga.champion_ref ? <a href={href.club(liga.champion_ref, liga.champion_name, 'palmares')}>{liga.champion_name}</a> : liga.champion_name}
              {liga.runner_up_name && <span className="muted" style={{ fontWeight: 500 }}>· final {liga.result ?? ''} ante {liga.runner_up_name}</span>}
            </div>
          </div>
          <div className="row" style={{ marginLeft: 'auto' }}>
            {champions
              .filter((c) => c.competition !== 'liga')
              .map((c) => (
                <span key={c.competition} className="chip">
                  {TROPHIES[c.competition].name} {c.label}: {c.champion_name}
                </span>
              ))}
          </div>
        </div>
      )}

      <LeagueCards data={data} />

      {!edition ? (
        <Section className="mt">
          <Empty>
            Todavía no hay datos.{' '}
            {window.d3.platform === 'desktop' ? (
              <a className="link" href={href.data()}>
                Sincroniza la ACB
              </a>
            ) : (
              'Vuelve en unos minutos.'
            )}
          </Empty>
        </Section>
      ) : (
        <>
          <div className="grid grid-2 mt">
            {data.lastRound && (
              <Section
                eyebrow="Resultados"
                title={data.lastRound.name}
                actions={
                  <a className="link" href={href.league('ACB', 'resultados')}>
                    Calendario completo →
                  </a>
                }
              >
                <div className="games-grid">
                  {data.lastRound.games.map((g) => (
                    <GameCard key={g.id} g={g} compact />
                  ))}
                </div>
              </Section>
            )}
            {data.nextRound && (
              <Section eyebrow="Próxima jornada" title={data.nextRound.name}>
                <div className="games-grid">
                  {data.nextRound.games.map((g) => (
                    <GameCard key={g.id} g={g} compact />
                  ))}
                </div>
              </Section>
            )}
          </div>

          <div className="grid grid-main mt">
            <Section
              eyebrow={`Liga Endesa ${edition.season_label}`}
              title="Clasificación"
              actions={
                <a className="link" href={href.league('ACB', 'clasificacion')}>
                  Completa →
                </a>
              }
            >
              <StandingsTable rows={data.standings} compact code="ACB" />
            </Section>
            <LeadersBox leaders={data.leaders} />
          </div>
        </>
      )}
    </>
  )
}

const COURT_LEADERS: [keyof HomeData['leaders'], 'PG' | 'SG' | 'SF' | 'C', string][] = [
  ['apg', 'PG', 'ast'],
  ['ppg', 'SG', 'pts'],
  ['pirpg', 'SF', 'val'],
  ['rpg', 'C', 'reb']
]
const surname = (n: string) => {
  const w = n.split(' ').filter((x) => !/^(jr\.?|sr\.?|ii|iii)$/i.test(x))
  return w[w.length - 1] ?? n
}

/** Portada: la jornada en titular y los líderes colocados en su posición sobre la pista. */
function HomeBoard({ data }: { data: HomeData }) {
  const { edition, lastRound, standings, leaders } = data
  const played = lastRound!.games.filter((g) => g.status === 'finished' && g.home_score != null)
  const pts = played.reduce((a, g) => a + g.home_score! + g.away_score!, 0)
  const top = played.flatMap((g) => [
    { v: g.home_score!, t: g.home },
    { v: g.away_score!, t: g.away }
  ]).sort((a, b) => b.v - a.v)[0]
  const att = played.filter((g) => g.attendance)
  const leader = standings[0]
  const unbeaten = standings.filter((t) => t.played > 0 && t.lost === 0)
  const used = new Set<string>()
  const five = COURT_LEADERS.map(([k, spot, unit]) => {
    const l = leaders[k].find((x) => !used.has(x.player_ref))
    if (l) used.add(l.player_ref)
    return l && { l, spot, tag: `${num(l.value)} ${unit}` }
  }).filter(Boolean) as { l: LeaderRow; spot: 'PG' | 'SG' | 'SF' | 'PF' | 'C'; tag: string }[]
  const extra = leaders.ppg.find((x) => !used.has(x.player_ref))
  if (extra) five.push({ l: extra, spot: 'PF', tag: `${num(extra.value)} pts` })
  const title = leader?.played
    ? `${leader.name}, ${unbeaten.length === 1 && unbeaten[0].team_id === leader.team_id ? 'único invicto' : 'líder'} con ${leader.diff > 0 ? '+' : ''}${leader.diff}`
    : `Arranca la Liga Endesa ${edition!.season_label}`
  return (
    <section className="board home-board">
      <div className="stack">
        <div>
          <div className="eyebrow">
            Liga Endesa {edition!.season_label} · {lastRound!.name} · {played.length} partidos · {int(pts)} puntos
          </div>
          <h1 className="board-title">{title}</h1>
        </div>
        {played.length > 0 && (
          <div className="kpi-strip">
            <div>
              <b>{leader ? `${leader.won}-${leader.lost}` : '—'}</b>
              <span>líder</span>
              <em>{leader?.abbr ?? leader?.short_name}</em>
            </div>
            <div>
              <b>{num(pts / played.length / 2)}</b>
              <span>puntos por equipo</span>
              <em>{lastRound!.name.toLowerCase()}</em>
            </div>
            <div>
              <b>{top?.v ?? '—'}</b>
              <span>máxima anotación</span>
              <em>{top?.t.short_name ?? top?.t.name}</em>
            </div>
            <div>
              <b>{att.length ? int(att.reduce((a, g) => a + g.attendance!, 0) / att.length) : '—'}</b>
              <span>espectadores</span>
              <em>media por partido</em>
            </div>
          </div>
        )}
        <div className="row">
          <a className="btn" href={href.league('ACB')}>
            Liga Endesa {edition!.season_label}
          </a>
          <a className="btn btn-ghost" href={href.players()}>
            Jugadores
          </a>
          <a className="btn btn-ghost" href={href.scouting()}>
            Scouting
          </a>
        </div>
      </div>
      <HalfCourt label="Quinteto de líderes · por partido" note={five.length ? 'cada uno en su sitio' : undefined}>
        {five.map(({ l, spot, tag }) => (
          <CourtPlayer key={l.player_ref} spot={spot} to={href.player(l.player_ref, l.display_name)} photo={l.photo_nobg ?? l.photo} name={surname(l.display_name)} tag={tag} color={l.team.color} />
        ))}
      </HalfCourt>
    </section>
  )
}

function LeagueCards({ data }: { data: HomeData }) {
  return (
    <div className="league-grid">
      {data.leagues.map((l) => (
        <LeagueCard key={l.code} code={l.code} name={l.name} soon={!l.edition}>
          {l.edition ? (
            <>
              <div
                className="season-progress"
                role="progressbar"
                aria-label={`Temporada ${l.edition.season_label}`}
                aria-valuemin={0}
                aria-valuemax={l.edition.games}
                aria-valuenow={l.edition.finished}
              >
                <span style={{ width: `${l.edition.games ? (100 * l.edition.finished) / l.edition.games : 0}%` }} />
              </div>
              <div className="lc-meta">
                <span>{l.edition.season_label}</span>
                <span>
                  {l.edition.finished}/{l.edition.games} partidos
                </span>
              </div>
              <div className="lc-meta">
                <span>{l.edition.teams} equipos</span>
              </div>
            </>
          ) : (
            <div className="row" style={{ marginTop: 12 }}>
              <span className="chip">Próximamente</span>
            </div>
          )}
        </LeagueCard>
      ))}
    </div>
  )
}

export const LEADER_LABELS = { pirpg: 'Valoración', ppg: 'Puntos', rpg: 'Rebotes', apg: 'Asistencias' } as const
type LeaderKey = keyof typeof LEADER_LABELS

export function LeadersBox({ leaders }: { leaders: Record<LeaderKey, LeaderRow[]> }) {
  const [stat, setStat] = useState<LeaderKey>('pirpg')
  const rows = leaders[stat]
  return (
    <Section
      eyebrow="Rankings"
      title="Líderes"
      actions={
        <Segmented
          value={stat}
          onChange={setStat}
          options={[
            { id: 'pirpg', label: 'VAL' },
            { id: 'ppg', label: 'PTS' },
            { id: 'rpg', label: 'REB' },
            { id: 'apg', label: 'AST' }
          ]}
        />
      }
    >
      <div className="small muted" style={{ marginBottom: 6 }}>
        {LEADER_LABELS[stat]} por partido · mínimo 10 minutos y la mitad de los partidos
      </div>
      {rows.length === 0 ? (
        <Empty>Sin partidos todavía.</Empty>
      ) : (
        <div className="leader-list">
          {rows.map((l, i) => (
            <a key={l.player_ref} className={`leader ${i === 0 ? 'first' : ''}`} href={href.player(l.player_ref, l.display_name)}>
              <span className="rank">{i + 1}</span>
              <PlayerPhoto nobg={l.photo_nobg} photo={l.photo} name={l.display_name} color={l.team.color} size={40} />
              <span style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{l.display_name}</div>
                <div className="small muted">{l.team.name}</div>
              </span>
              <span className="val">{num(l.value)}</span>
            </a>
          ))}
        </div>
      )}
    </Section>
  )
}

