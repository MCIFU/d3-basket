import { useEffect, useRef, useState } from 'react'
import { Loading, Section, StatTile, useLoad } from '../components'
import { fmtDateTime, int } from '../format'

const STAGES: Record<string, string> = {
  calendar: 'Calendario',
  rosters: 'Plantillas',
  players: 'Fichas de jugador',
  boxscores: 'Estadísticas de partidos',
  schedules: 'Partidos por equipo',
  history: 'Historia y palmarés',
  careers: 'Trayectorias',
  done: 'Terminado'
}

export function DataPage() {
  const [info, error, reload] = useLoad(() => window.d3.dbInfo(), [])
  if (!info) return <Loading error={error} />
  const c = info.counts
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Fuentes y actualización</div>
        <h1>Datos</h1>
        <p>{info.updated_at ? `Última actualización: ${fmtDateTime(info.updated_at)}` : 'Sin datos todavía.'}</p>
      </div>
      <div className="stack">
        <Section title="Contenido de la base de datos">
          <div className="stat-tiles">
            <StatTile label="Temporadas" value={int(c.competition_seasons)} />
            <StatTile label="Clubes" value={int(c.clubs)} />
            <StatTile label="Jugadores" value={int(c.players)} />
            <StatTile label="Partidos" value={int(c.games)} />
            <StatTile label="Líneas de estadística" value={int(c.player_game_stats)} />
            <StatTile label="Finales en el palmarés" value={int(c.honours)} />
            <StatTile label="Informes de scouting" value={int(c.scouting_reports)} />
          </div>
          <p className="note">{window.d3.platform === 'desktop' ? `Archivo: ${info.path}` : info.path}</p>
        </Section>
        {window.d3.platform === 'desktop' ? (
          <SyncPanel onDone={reload} />
        ) : (
          <Section title="Actualización automática">
            <p className="muted" style={{ margin: 0 }}>
              La versión web se actualiza en el servidor: en cada actualización se descargan los resultados, estadísticas y plantillas
              nuevas de acb.com y de la FEB. Los informes de scouting se guardan en tu navegador (expórtalos desde Scouting para tener
              una copia).
            </p>
          </Section>
        )}
        <Section title="Fuentes">
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            <li>
              <b>baloncestoenvivo.feb.es</b> — Primera, Segunda y Tercera FEB: calendario, resultados (también playoffs y fases
              finales), estadísticas por partido, plantillas, datos de los clubes, fotos y trayectoria completa de cada jugador en
              todas las categorías FEB.
            </li>
            <li>
              <b>acb.com</b> — calendario, resultados, estadísticas por partido y cuarto, plantillas, fichas de jugador, datos de los
              clubes, clasificación histórica y cuadro de honor.
            </li>
            <li>
              <b>Wikipedia</b> (CC BY-SA 4.0) y <b>Wikidata</b> — campeones y subcampeones por temporada de Liga, Copa del Rey y
              Supercopa, e historia y año de fundación de los clubes.
            </li>
            <li>
              <b>Wikimedia Commons</b> — fotografías de los trofeos (autor: Brgesto, CC BY-SA 4.0).
            </li>
          </ul>
        </Section>
      </div>
    </>
  )
}

function SyncPanel({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [progress, setProgress] = useState<{ stage: string; done: number; total: number }>()
  const [season, setSeason] = useState('')
  const [league, setLeague] = useState('ACB')
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
  useEffect(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), [lines])

  const run = async () => {
    setBusy(true)
    setLines([])
    const res = await window.d3.syncAcb({ league, season: season ? Number(season) : undefined, players: bios })
    setLines((l) => [...l, res.ok ? `✔ ${res.message}` : `✗ ${res.message}`])
    setBusy(false)
    setProgress(undefined)
    onDone()
  }

  return (
    <Section title="Sincronizar datos" eyebrow="Escritorio">
      <div className="row">
        <select className="select" value={league} onChange={(e) => (setLeague(e.target.value), setSeason(''))} disabled={busy}>
          <option value="ACB">Liga Endesa (acb.com)</option>
          <option value="LEB_ORO">Primera FEB (feb.es)</option>
          <option value="LEB_PLATA">Segunda FEB (feb.es)</option>
          <option value="TERCERA_FEB">Tercera FEB (feb.es)</option>
          <option value="COPA_ESPANA">Copa España (feb.es)</option>
        </select>
        <select className="select" value={season} onChange={(e) => setSeason(e.target.value)} disabled={busy}>
          <option value="">Temporada en curso</option>
          {Array.from({ length: 10 }, (_, i) => 2025 - i).map((y) => (
            <option key={y} value={y}>
              Histórico {y}-{String(y + 1).slice(-2)}
            </option>
          ))}
        </select>
        <label className="row muted">
          <input type="checkbox" checked={bios} onChange={(e) => setBios(e.target.checked)} disabled={busy} />
          Fichas biográficas
        </label>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? 'Sincronizando…' : 'Sincronizar'}
        </button>
        {progress && progress.total > 0 && (
          <span className="chip brand">
            {STAGES[progress.stage] ?? progress.stage} {progress.done}/{progress.total}
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
      <p className="note">
        Peticiones de una en una (1 por segundo). La primera vez tarda unos minutos; después solo se descarga lo nuevo. La trayectoria
        histórica de los jugadores se completa poco a poco en cada sincronización.
      </p>
    </Section>
  )
}
