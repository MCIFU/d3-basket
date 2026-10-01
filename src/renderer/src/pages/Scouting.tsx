import { useEffect, useState } from 'react'
import { SCOUTING_ATTRIBUTES, type ScoutingReport } from '../../../shared/api'
import { Empty, Loading, PlayerPhoto, Section, useLoad } from '../components'
import { fmtDate } from '../format'
import { href, navigate } from '../router'

const REC_CLASS: Record<string, string> = { fichar: 'win', seguir: 'brand', descartar: 'loss' }

export function ReportCard({ r, showPlayer }: { r: ScoutingReport; showPlayer?: boolean }) {
  const name = r.player_name ?? ''
  return (
    <div className="report">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {showPlayer && r.player_ref && (
            <a className="row" href={href.player(r.player_ref, name)}>
              <PlayerPhoto nobg={r.player_photo} name={name} size={40} />
              <b>{name}</b>
            </a>
          )}
          <h3>{r.role || r.archetype || 'Informe'}</h3>
        </div>
        <div className="row">
          {r.recommendation && <span className={`chip ${REC_CLASS[r.recommendation]}`}>{r.recommendation}</span>}
          {r.current_level != null && <span className="chip">Nivel {r.current_level}/10</span>}
          {r.potential != null && <span className="chip brand">Potencial {r.potential}/10</span>}
          {r.id && r.player_ref && (
            <a className="btn btn-ghost" href={href.report(r.id, r.player_ref, name)}>
              Editar
            </a>
          )}
        </div>
      </div>
      <div className="small muted">
        {fmtDate(r.report_date)} {r.author ? `· ${r.author}` : ''} {r.archetype && r.role ? `· ${r.archetype}` : ''}
      </div>
      {(
        [
          ['Fortalezas', r.strengths],
          ['Debilidades', r.weaknesses],
          ['Ataque', r.offense_notes],
          ['Defensa', r.defense_notes],
          ['Físico', r.physical_notes],
          ['Intangibles', r.intangibles],
          ['Comparables', r.comparables],
          ['Proyección', r.projection]
        ] as const
      )
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <p key={k}>
            <span className="label">{k} · </span>
            {v}
          </p>
        ))}
      {!!r.ratings?.length && (
        <div className="ratings" style={{ marginTop: 10 }}>
          {r.ratings.map((rt) => (
            <div key={rt.attribute} className="rating-row">
              <span>{rt.attribute}</span>
              <div className="bar">
                <div style={{ width: `${rt.score * 10}%` }} />
              </div>
              <b>{rt.score}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ScoutingPage() {
  const [reports, error, reload] = useLoad(() => window.d3.reports(), [])
  const [notice, setNotice] = useState<string>()
  if (!reports) return <Loading error={error} />

  const exportReports = async () => {
    const json = await window.d3.exportReports!()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `d3basket-informes-${new Date().toISOString().slice(0, 10)}.json` }).click()
    URL.revokeObjectURL(url)
  }
  const importReports = async (file?: File) => {
    if (!file) return
    try {
      setNotice(`${await window.d3.importReports!(await file.text())} informes importados.`)
      reload()
    } catch {
      setNotice('El archivo no es una copia válida de informes de D3 Basket.')
    }
  }

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Informes de ojeador</div>
        <h1>Scouting</h1>
        <p>
          {reports.length} informes. Para crear uno, abre la ficha de un jugador (búscalo arriba) y pulsa “+ Informe de scouting”.
        </p>
      </div>
      {window.d3.exportReports && (
        <div className="card row" style={{ marginBottom: 20 }}>
          <span className="muted spacer">
            En la versión web los informes se guardan en este navegador. Exporta una copia para no perderlos o para pasarlos a otro
            dispositivo.
          </span>
          <button className="btn btn-ghost" onClick={exportReports}>
            Exportar informes
          </button>
          <label className="btn btn-ghost">
            Importar…
            <input type="file" accept="application/json,.json" hidden onChange={(e) => importReports(e.target.files?.[0])} />
          </label>
          {notice && <span className="chip brand">{notice}</span>}
        </div>
      )}
      {reports.length === 0 ? (
        <Section>
          <div className="empty-state">
            <h3>Todavía no hay informes</h3>
            <p>
              Un informe recoge tu valoración de un jugador: atributos del 1 al 10, rol, puntos fuertes y débiles y una
              recomendación (fichar, seguir o descartar). Se crea desde la ficha del jugador.
            </p>
            <a className="btn" href={href.players()}>
              Elegir un jugador
            </a>
          </div>
        </Section>
      ) : (
        reports.map((r) => <ReportCard key={r.id} r={r} showPlayer />)
      )}
    </>
  )
}

const TEXT_FIELDS: [keyof ScoutingReport, string, boolean?][] = [
  ['role', 'Rol en el equipo'],
  ['archetype', 'Arquetipo (p. ej. 3&D, pívot de bloqueo y continuación)'],
  ['strengths', 'Fortalezas', true],
  ['weaknesses', 'Debilidades', true],
  ['offense_notes', 'Ataque', true],
  ['defense_notes', 'Defensa', true],
  ['physical_notes', 'Físico / atletismo', true],
  ['intangibles', 'Intangibles / carácter', true],
  ['comparables', 'Jugadores comparables'],
  ['projection', 'Proyección / techo', true]
]

export function ReportEditor({ playerRef, reportId }: { playerRef: string; reportId?: number }) {
  const [data, error] = useLoad(() => window.d3.player(playerRef), [playerRef])
  const [r, setR] = useState<ScoutingReport | undefined>()
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    const existing = data.reports.find((x) => x.id === reportId)
    if (existing) {
      setR(existing)
      setRatings(Object.fromEntries((existing.ratings ?? []).map((x) => [x.attribute, x.score])))
    } else {
      setR({ player_id: data.player.id, team_id: data.current?.team_id ?? null, report_date: new Date().toISOString().slice(0, 10) })
    }
  }, [data, reportId])

  if (error) return <Loading error={error} />
  if (data === undefined || !r) return <Loading />
  if (!data) return <Empty>No se ha encontrado el jugador.</Empty>
  const p = data.player
  const set = (k: keyof ScoutingReport, v: unknown) => setR((prev) => ({ ...prev!, [k]: v === '' ? null : v }))
  const back = href.player(p.ref, p.display_name, 'scouting')

  const save = async () => {
    setSaving(true)
    await window.d3.saveReport({ ...r, ratings: Object.entries(ratings).map(([attribute, score]) => ({ attribute, score })) })
    setSaving(false)
    navigate(back)
  }
  const remove = async () => {
    if (!r.id || !confirm('¿Borrar este informe?')) return
    await window.d3.deleteReport(r.id)
    navigate(back)
  }

  return (
    <>
      <div className="page-title row" style={{ gap: 16 }}>
        <PlayerPhoto nobg={p.photo_nobg} photo={p.photo} name={p.display_name} color={data.current?.color} size={64} />
        <div>
          <div className="eyebrow">{reportId ? 'Editar informe' : 'Nuevo informe'}</div>
          <h1>{p.display_name}</h1>
          <p style={{ margin: 0 }}>{[data.current?.name, p.position].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <Section>
        <div className="form-grid">
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
            <h2 style={{ margin: '10px 0 12px' }}>Valoración por atributos</h2>
            <div className="ratings">
              {SCOUTING_ATTRIBUTES.map((a) => (
                <div key={a} className="rating-row">
                  <span>{a}</span>
                  <input type="range" min={0} max={10} value={ratings[a] ?? 0} onChange={(e) => setRatings((prev) => ({ ...prev, [a]: Number(e.target.value) }))} />
                  <b>{ratings[a] || '—'}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="full row">
            <button className="btn" onClick={save} disabled={saving}>
              Guardar informe
            </button>
            <a className="btn btn-ghost" href={back}>
              Cancelar
            </a>
            {r.id && (
              <button className="btn btn-danger" onClick={remove}>
                Borrar
              </button>
            )}
          </div>
        </div>
      </Section>
    </>
  )
}
