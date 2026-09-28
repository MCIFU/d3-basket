import { contextBridge, ipcRenderer } from 'electron'
import type { D3Api, SyncProgressEvent } from '../shared/api'

const api: D3Api = {
  platform: 'desktop',
  dbInfo: () => ipcRenderer.invoke('db:info'),
  home: () => ipcRenderer.invoke('db:home'),
  competitions: () => ipcRenderer.invoke('db:competitions'),
  league: (code, year) => ipcRenderer.invoke('db:league', code, year),
  clubs: () => ipcRenderer.invoke('db:clubs'),
  club: (ref, year) => ipcRenderer.invoke('db:club', ref, year),
  players: () => ipcRenderer.invoke('db:players'),
  player: (ref) => ipcRenderer.invoke('db:player', ref),
  game: (ref) => ipcRenderer.invoke('db:game', ref),
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
