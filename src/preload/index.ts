import { contextBridge, ipcRenderer } from 'electron'
import type { D3Api, SyncProgressEvent } from '../shared/api'

const api: D3Api = {
  dbInfo: () => ipcRenderer.invoke('db:info'),
  editions: () => ipcRenderer.invoke('db:editions'),
  standings: (csId) => ipcRenderer.invoke('db:standings', csId),
  teams: (csId) => ipcRenderer.invoke('db:teams', csId),
  team: (teamId) => ipcRenderer.invoke('db:team', teamId),
  games: (csId) => ipcRenderer.invoke('db:games', csId),
  game: (gameId) => ipcRenderer.invoke('db:game', gameId),
  player: (playerId) => ipcRenderer.invoke('db:player', playerId),
  leaders: (csId, stat) => ipcRenderer.invoke('db:leaders', csId, stat),
  search: (q) => ipcRenderer.invoke('db:search', q),
  reports: () => ipcRenderer.invoke('db:reports'),
  saveReport: (r) => ipcRenderer.invoke('db:saveReport', r),
  deleteReport: (id) => ipcRenderer.invoke('db:deleteReport', id),
  syncAcb: (opts) => ipcRenderer.invoke('sync:acb', opts),
  onSyncProgress: (cb) => {
    const listener = (_e: unknown, ev: SyncProgressEvent) => cb(ev)
    ipcRenderer.on('sync:progress', listener)
    return () => ipcRenderer.removeListener('sync:progress', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
}

contextBridge.exposeInMainWorld('d3', api)
