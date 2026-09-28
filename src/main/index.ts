import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { defaultDbPath, openDatabase, type DB } from '../db/database'
import { Queries } from '../db/queries'
import { HttpClient } from '../scraper/core/http'
import { AcbScraper } from '../scraper/acb/sync'
import type { LeaderStat, ScoutingReport, SyncProgressEvent } from '../shared/api'

let db: DB
let queries: Queries
let win: BrowserWindow | null = null
let syncing = false

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'D3 Basket',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  // Los enlaces externos (acb.com...) se abren en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function registerIpc() {
  const dbPath = defaultDbPath()
  ipcMain.handle('db:info', () => ({ path: dbPath, counts: queries.counts() }))
  ipcMain.handle('db:editions', () => queries.editions())
  ipcMain.handle('db:standings', (_e, csId: number) => queries.standings(csId))
  ipcMain.handle('db:teams', (_e, csId: number) => queries.teams(csId))
  ipcMain.handle('db:team', (_e, teamId: number) => queries.team(teamId))
  ipcMain.handle('db:games', (_e, csId: number) => queries.games(csId))
  ipcMain.handle('db:game', (_e, gameId: number) => queries.game(gameId))
  ipcMain.handle('db:player', (_e, playerId: number) => queries.player(playerId))
  ipcMain.handle('db:leaders', (_e, csId: number, stat: LeaderStat) => queries.leaders(csId, stat))
  ipcMain.handle('db:search', (_e, q: string) => queries.search(q))
  ipcMain.handle('db:reports', () => queries.reports())
  ipcMain.handle('db:saveReport', (_e, r: ScoutingReport) => queries.saveReport(r))
  ipcMain.handle('db:deleteReport', (_e, id: number) => queries.deleteReport(id))
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })

  ipcMain.handle('sync:acb', async (_e, opts: { season?: number; players?: boolean }) => {
    if (syncing) return { ok: false, message: 'Ya hay una sincronización en marcha' }
    syncing = true
    const send = (ev: SyncProgressEvent) => win?.webContents.send('sync:progress', ev)
    const http = new HttpClient({ minDelayMs: 1000, log: (msg) => send({ stage: 'log', done: 0, total: 0, log: msg }) })
    const scraper = new AcbScraper(db, http)
    const common = {
      players: opts.players !== false,
      log: (msg: string) => send({ stage: 'log', done: 0, total: 0, log: msg }),
      onProgress: (p: SyncProgressEvent) => send(p)
    }
    try {
      const s = opts.season ? await scraper.syncHistoric(opts.season, common) : await scraper.syncCurrent(common)
      return {
        ok: true,
        message:
          `${s.edition}: ${s.teams} equipos, ${s.games} partidos, ${s.boxscores} boxscores nuevos, ` +
          `${s.playerBios} fichas (${s.requests} peticiones${s.errors.length ? `, ${s.errors.length} avisos` : ''})`
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      syncing = false
    }
  })
}

app.whenReady().then(() => {
  db = openDatabase()
  queries = new Queries(db)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  db?.close()
  if (process.platform !== 'darwin') app.quit()
})
