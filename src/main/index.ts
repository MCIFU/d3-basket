import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { defaultDbPath, openDatabase, type DB } from '../db/database'
import { Queries } from '../db/queries'
import { HttpClient } from '../scraper/core/http'
import { AcbScraper } from '../scraper/acb/sync'
import { FebScraper } from '../scraper/feb/sync'
import type { ScoutingReport, SyncProgressEvent } from '../shared/api'

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
    backgroundColor: '#f4f6f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  // Enlaces internos (clic central / Ctrl+clic) → nueva ventana de la app; externos → navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const internal = url.startsWith('file:') || (!!process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL))
    if (internal) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1400,
          height: 900,
          autoHideMenuBar: true,
          backgroundColor: '#f4f6f9',
          webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true }
        }
      }
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function registerIpc() {
  const dbPath = defaultDbPath()
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R) =>
    ipcMain.handle(channel, (_e, ...args) => fn(...(args as A)))
  handle('db:info', () => ({ path: dbPath, counts: queries.counts(), updated_at: queries.lastUpdate() }))
  handle('db:home', () => queries.home())
  handle('db:competitions', () => queries.competitions())
  handle('db:league', (code: string, year?: number) => queries.league(code, year))
  handle('db:clubs', () => queries.clubs())
  handle('db:club', (ref: string, year?: number) => queries.club(ref, year))
  handle('db:players', () => queries.players())
  handle('db:player', (ref: string) => queries.player(ref))
  handle('db:game', (ref: string) => queries.game(ref))
  handle('db:search', (q: string) => queries.search(q))
  handle('db:reports', () => queries.reports())
  handle('db:saveReport', (r: ScoutingReport) => queries.saveReport(r))
  handle('db:deleteReport', (id: number) => queries.deleteReport(id))
  handle('app:openExternal', (url: string) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : undefined))

  ipcMain.handle('sync:acb', async (_e, opts: { season?: number; players?: boolean; league?: string }) => {
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
      const s =
        opts.league === 'LEB_ORO' || opts.league === 'LEB_PLATA'
          ? await new FebScraper(db, http).sync(opts.league, { ...common, season: opts.season })
          : opts.season
            ? await scraper.syncHistoric(opts.season, common)
            : await scraper.syncCurrent(common)
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
