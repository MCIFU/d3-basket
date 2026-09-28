import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'games'; round?: number }
  | { name: 'teams' }
  | { name: 'team'; id: number }
  | { name: 'player'; id: number }
  | { name: 'game'; id: number }
  | { name: 'scouting' }
  | { name: 'report'; playerId: number; reportId?: number }

export type Navigate = (r: Route) => void

/** Carga asíncrona con dependencia; devuelve [datos, recargar]. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [T | undefined, () => void, string | undefined] {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setError(undefined)
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e?.message ?? e)))
    return () => {
      alive = false
    }
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return [data, reload, error]
}

const TZ = 'Europe/Madrid'
export const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('es-ES', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' })
    : 'Sin fecha'
export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-ES', {
        timeZone: TZ,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Fecha por confirmar'
export const fmtMin = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
export const fmtNum = (v: number | null | undefined, digits = 1) => (v == null ? '—' : v.toFixed(digits))
export const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`)
export const shot = (m: number, a: number) => `${m}/${a}`

export function age(birthDate?: string | null): number | undefined {
  if (!birthDate) return undefined
  const b = new Date(birthDate)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

export function Logo({ src, big }: { src?: string | null; big?: boolean }) {
  if (!src) return <span className={big ? 'logo-lg' : 'logo'} />
  return <img className={big ? 'logo-lg' : 'logo'} src={src} alt="" loading="lazy" />
}

export function Loading({ error }: { error?: string }) {
  return <div className="empty">{error ? `Error: ${error}` : 'Cargando…'}</div>
}

export function StatusChip({ status }: { status: string }) {
  const label: Record<string, string> = {
    scheduled: 'Programado',
    unscheduled: 'Sin fecha',
    live: 'En juego',
    finished: 'Final',
    postponed: 'Aplazado',
    suspended: 'Suspendido'
  }
  return <span className={`chip ${status === 'live' ? 'accent' : ''}`}>{label[status] ?? status}</span>
}
