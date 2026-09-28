/**
 * Implementación web de la API de D3 Basket (Chrome, Firefox, Brave, Edge, Safari...).
 *
 * - Los datos (ACB, etc.) se publican como un fichero SQLite comprimido
 *   (`data/d3basket.db.gz`) que genera el build de Netlify con el scraper.
 * - La base de datos se abre en memoria con sql.js (SQLite en WebAssembly) y se
 *   consultan con las mismas `Queries` que la app de escritorio.
 * - Los informes de scouting se guardan en el navegador (localStorage), ligados al
 *   id oficial del jugador para que sobrevivan a cada actualización de datos.
 */
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { migrations } from '../../../db/migrations'
import { Queries } from '../../../db/queries'
import type { D3Api, ScoutingReport } from '../../../shared/api'
import { wrapSqlJs } from './sqljs'

const DATA_URL = 'data/d3basket.db.gz'
const REPORTS_KEY = 'd3basket.reports.v1'

interface StoredReport {
  uid: string
  player_source: string // id del jugador en la fuente (acb)
  team_source?: string | null
  report: Omit<ScoutingReport, 'id' | 'player_id' | 'team_id' | 'player_name' | 'updated_at'>
  saved_at: string
}

async function loadDatabaseBytes(): Promise<Uint8Array | undefined> {
  const res = await fetch(new URL(DATA_URL, document.baseURI), { cache: 'no-cache' })
  if (!res.ok) return undefined
  const bytes = new Uint8Array(await res.arrayBuffer())
  // Algunos servidores envían los .gz con `Content-Encoding: gzip` y el navegador ya
  // los descomprime; otros no. Solo descomprimimos si siguen siendo gzip (1f 8b).
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const readStore = (): StoredReport[] => {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? '[]') as StoredReport[]
  } catch {
    return []
  }
}
const writeStore = (items: StoredReport[]) => {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(items))
  } catch {
    // Almacenamiento lleno o bloqueado (modo privado): los informes duran lo que la pestaña.
  }
}

export async function createWebApi(): Promise<D3Api> {
  const [SQL, bytes] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), loadDatabaseBytes()])
  const raw = new SQL.Database(bytes)
  if (!bytes) for (const m of migrations) raw.exec(m.sql) // sin datos publicados: esquema vacío
  const db = wrapSqlJs(raw)
  const q = new Queries(db)

  const sourceId = (type: 'player' | 'team', id: number | null | undefined) =>
    id == null
      ? undefined
      : (db.prepare(`SELECT external_id FROM external_ids WHERE entity_type = ? AND entity_id = ? AND source = 'acb'`).get(type, id) as
          | { external_id: string }
          | undefined)?.external_id
  const localId = (type: 'player' | 'team', ext: string | null | undefined) =>
    ext == null
      ? undefined
      : (db.prepare(`SELECT entity_id FROM external_ids WHERE entity_type = ? AND external_id = ? AND source = 'acb'`).get(type, ext) as
          | { entity_id: number }
          | undefined)?.entity_id

  // Informes guardados en este navegador → base de datos en memoria.
  let store = readStore()
  const uidByReportId = new Map<number, string>()
  const insertStored = (s: StoredReport) => {
    const playerId = localId('player', s.player_source)
    if (playerId == null) return false // jugador ausente en estos datos: se conserva en el almacén
    const id = q.saveReport({ ...s.report, player_id: playerId, team_id: localId('team', s.team_source) ?? null })
    uidByReportId.set(id, s.uid)
    return true
  }
  store.forEach(insertStored)

  const toStored = (r: ScoutingReport, uid: string): StoredReport => {
    const { id: _id, player_id, team_id, player_name: _n, updated_at: _u, ...report } = r
    return {
      uid,
      player_source: sourceId('player', player_id) ?? String(player_id),
      team_source: sourceId('team', team_id) ?? null,
      report,
      saved_at: new Date().toISOString()
    }
  }

  const noSync = async () => ({
    ok: false,
    message: 'En la versión web los datos se actualizan automáticamente en el servidor.'
  })

  return {
    platform: 'web',
    dbInfo: async () => ({ path: 'Datos publicados (solo lectura)', counts: q.counts() }),
    editions: async () => q.editions(),
    standings: async (csId) => q.standings(csId),
    teams: async (csId) => q.teams(csId),
    team: async (teamId) => q.team(teamId),
    games: async (csId) => q.games(csId),
    game: async (gameId) => q.game(gameId),
    player: async (playerId) => q.player(playerId),
    leaders: async (csId, stat) => q.leaders(csId, stat),
    search: async (text) => q.search(text),
    reports: async () => q.reports(),
    saveReport: async (r) => {
      const id = q.saveReport(r)
      const uid = uidByReportId.get(id) ?? crypto.randomUUID()
      uidByReportId.set(id, uid)
      const saved = q.reports(r.player_id).find((x) => x.id === id) ?? { ...r, id }
      store = [...store.filter((s) => s.uid !== uid), toStored(saved, uid)]
      writeStore(store)
      return id
    },
    deleteReport: async (id) => {
      q.deleteReport(id)
      const uid = uidByReportId.get(id)
      store = store.filter((s) => s.uid !== uid)
      writeStore(store)
    },
    exportReports: async () => JSON.stringify({ app: 'd3basket', version: 1, reports: store }, null, 2),
    importReports: async (json) => {
      const parsed = JSON.parse(json) as { reports?: StoredReport[] }
      let added = 0
      for (const s of parsed.reports ?? []) {
        if (!s?.uid || !s.player_source || store.some((x) => x.uid === s.uid)) continue
        store.push(s)
        insertStored(s)
        added++
      }
      writeStore(store)
      return added
    },
    syncAcb: noSync,
    onSyncProgress: () => () => {},
    openExternal: async (url) => {
      if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener')
    }
  } satisfies D3Api
}

