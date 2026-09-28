import { useEffect, useState } from 'react'
import { SCOUTING_ATTRIBUTES, type ScoutingReport } from '../../../shared/api'
import { ReportCard } from './Player'
import { Loading, useLoad, type Navigate } from '../ui'

export function Scouting({ navigate }: { navigate: Navigate }) {
  const [reports, reload, error] = useLoad(() => window.d3.reports(), [])
  const [notice, setNotice] = useState<string>()
  if (!reports) return <Loading error={error} />

  const exportReports = async () => {
    const json = await window.d3.exportReports!()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `d3basket-informes-${new Date().toISOString().slice(0, 10)}.json`
    })
    a.click()
    URL.revokeObjectURL(url)
  }
  const importReports = async (file?: File) => {
    if (!file) return
    try {
      const added = await window.d3.importReports!(await file.text())
      setNotice(`${added} informes importados.`)
      reload()
    } catch {
      setNotice('El archivo no es una copia válida de informes de D3 Basket.')
    }
  }

  return (
    <>
      <h1>Scouting</h1>
      <div className="sub">
        {reports.length} informes. Para crear uno nuevo, abre la ficha de un jugador (búscalo arriba) y pulsa “+ Informe de scouting”.
      </div>
      {window.d3.exportReports && (
        <div className="panel row">
          <span className="web-note" style={{ flex: 1 }}>
            Los informes se guardan en este navegador. Exporta una copia para no perderlos o para pasarlos a otro dispositivo.
          </span>
          <button className="btn ghost" onClick={exportReports}>
            Exportar informes
          </button>
          <label className="btn ghost">
            Importar…
            <input type="file" accept="application/json,.json" hidden onChange={(e) => importReports(e.target.files?.[0])} />
          </label>
          {notice && <span className="chip accent">{notice}</span>}
        </div>
      )}
      {reports.length === 0 ? (
        <div className="panel empty">Todavía no hay informes.</div>
      ) : (
        reports.map((r) => (
          <ReportCard key={r.id} r={r} showPlayer onEdit={() => navigate({ name: 'report', playerId: r.player_id, reportId: r.id })} />
        ))
      )}
    </>
  )
}

const TEXT_FIELDS: [keyof ScoutingReport, string, boolean?][] = [
  ['role', 'Rol en el equipo'],
  ['archetype', 'Arquetipo (p.ej. 3&D, pívot de P&R)'],
  ['strengths', 'Fortalezas', true],
  ['weaknesses', 'Debilidades', true],
  ['offense_notes', 'Ataque', true],
  ['defense_notes', 'Defensa', true],
  ['physical_notes', 'Físico / atletismo', true],
  ['intangibles', 'Intangibles / carácter', true],
  ['comparables', 'Jugadores comparables'],
  ['projection', 'Proyección / techo', true]
]

export function ReportEditor({ playerId, reportId, navigate }: { playerId: number; reportId?: number; navigate: Navigate }) {
  const [player] = useLoad(() => window.d3.player(playerId), [playerId])
  const [r, setR] = useState<ScoutingReport>({ player_id: playerId, report_date: new Date().toISOString().slice(0, 10) })
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!player) return
    const existing = player.reports.find((x) => x.id === reportId)
    if (existing) {
      setR(existing)
      setRatings(Object.fromEntries((existing.ratings ?? []).map((x) => [x.attribute, x.score])))
    } else {
      const current = player.seasons[0]
      setR((prev) => ({ ...prev, team_id: current?.team_id ?? null }))
    }
  }, [player, reportId])

  if (!player) return <Loading />
  const set = (k: keyof ScoutingReport, v: unknown) => setR((prev) => ({ ...prev, [k]: v === '' ? null : v }))

  const save = async () => {
    setSaving(true)
    await window.d3.saveReport({
      ...r,
      ratings: Object.entries(ratings).map(([attribute, score]) => ({ attribute, score }))
    })
    setSaving(false)
    navigate({ name: 'player', id: playerId })
  }
  const remove = async () => {
    if (!r.id || !confirm('¿Borrar este informe?')) return
    await window.d3.deleteReport(r.id)
    navigate({ name: 'player', id: playerId })
  }

  return (
    <>
      <h1>{reportId ? 'Editar informe' : 'Nuevo informe'}</h1>
      <div className="sub">{player.player.display_name}</div>
      <div className="panel form">
        <label>
          Fecha
          <input type="date" value={r.report_date ?? ''} onChange={(e) => set('report_date', e.target.value)} />
        </label>
        <label>
          Autor
          <input value={r.author ?? ''} onChange={(e) => set('author', e.target.value)} />
        </label>
        {TEXT_FIELDS.map(([k, label, long]) => (
          <label key={k} className={long ? 'full' : ''}>
            {label}
            {long ? (
              <textarea value={(r[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />
            ) : (
              <input value={(r[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />
            )}
          </label>
        ))}
        <label>
          Nivel actual (1-10)
          <input type="number" min={1} max={10} value={r.current_level ?? ''} onChange={(e) => set('current_level', e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label>
          Potencial (1-10)
          <input type="number" min={1} max={10} value={r.potential ?? ''} onChange={(e) => set('potential', e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label>
          Recomendación
          <select value={r.recommendation ?? ''} onChange={(e) => set('recommendation', e.target.value)}>
            <option value="">—</option>
            <option value="fichar">Fichar</option>
            <option value="seguir">Seguir</option>
            <option value="descartar">Descartar</option>
          </select>
        </label>
        <div className="full">
          <h2 style={{ marginTop: 10 }}>Valoración por atributos</h2>
          <div className="ratings">
            {SCOUTING_ATTRIBUTES.map((a) => (
              <div key={a} className="rating-row">
                <span>{a}</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={ratings[a] ?? 0}
                  onChange={(e) => setRatings((prev) => ({ ...prev, [a]: Number(e.target.value) }))}
                />
                <strong>{ratings[a] || '—'}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="full row">
          <button className="btn" onClick={save} disabled={saving}>
            Guardar informe
          </button>
          <button className="btn ghost" onClick={() => navigate({ name: 'player', id: playerId })}>
            Cancelar
          </button>
          {r.id && (
            <button className="btn danger" onClick={remove}>
              Borrar
            </button>
          )}
        </div>
      </div>
    </>
  )
}
