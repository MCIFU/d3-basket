import { useState } from 'react'
import type { HomeData, LeaderRow } from '../../../shared/api'
import {
  Empty,
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
import { num } from '../format'
import { href } from '../router'
import { LeagueCard, StandingsTable } from './Leagues'

export function HomePage() {
  const [data, error] = useLoad(() => window.d3.home(), [])
  if (!data) return <Loading error={error} />
  const { edition, champions } = data
  const liga = champions.find((c) => c.competition === 'liga')

  return (
    <>
      <section className="hero home-hero">
        <div>
          <div className="eyebrow">Scouting y estadística</div>
          <h1>El baloncesto español, en datos.</h1>
          <p className="lead">
            Clasificaciones, estadísticas avanzadas, trayectorias y palmarés de la Liga Endesa y la Primera, Segunda y Tercera FEB, con fichas de equipo y jugador
            e informes de scouting propios.
          </p>
          <div className="hero-actions">
            <a className="btn" href={href.league('ACB')}>
              Liga Endesa {edition?.season_label}
            </a>
            <a className="btn btn-light" href={href.players()}>
              Jugadores
            </a>
            <a className="btn btn-light" href={href.scouting()}>
              Scouting
            </a>
          </div>
        </div>
        {liga && (
          <div className="champion-card">
            <Trophy competition="liga" size={120} />
            <div>
              <div className="k">Vigente campeón de Liga · {liga.label}</div>
              <div className="v">
                <TeamLogo src={liga.champion_logo} name={liga.champion_name} size={34} />
                {liga.champion_ref ? (
                  <a href={href.club(liga.champion_ref, liga.champion_name, 'palmares')}>{liga.champion_name}</a>
                ) : (
                  liga.champion_name
                )}
              </div>
              <p className="small" style={{ margin: 0 }}>
                {liga.runner_up_name && `Final ${liga.result ?? ''} ante ${liga.runner_up_name}`}
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                {champions
                  .filter((c) => c.competition !== 'liga')
                  .map((c) => (
                    <span key={c.competition} className="chip">
                      {TROPHIES[c.competition].name} {c.label}: {c.champion_name}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        )}
      </section>

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

