import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface HttpClientOptions {
  /** Pausa mínima entre peticiones al mismo host (ms). Sé amable con la web oficial. */
  minDelayMs?: number
  retries?: number
  timeoutMs?: number
  userAgent?: string
  /** Carpeta para cachear HTML crudo (útil para depurar cambios de estructura). */
  cacheDir?: string
  /** Edad máxima de la caché en ms. 0 = no leer de caché (pero sí escribir si hay cacheDir). */
  cacheTtlMs?: number
  log?: (msg: string) => void
}

export interface FetchResult {
  url: string
  finalUrl: string
  status: number
  body: string
  fromCache: boolean
}

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number
  ) {
    super(`HTTP ${status} en ${url}`)
    this.name = 'HttpError'
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const DEFAULT_USER_AGENT = 'D3Basket/0.1 (scouting personal; +https://github.com/MCIFU/d3-basket)'

/**
 * Cliente HTTP educado: una petición cada `minDelayMs` por host, reintentos con
 * backoff exponencial ante 429/5xx/errores de red, timeout, y caché opcional en disco.
 */
export class HttpClient {
  private lastRequestAt = new Map<string, number>()
  private queue: Promise<unknown> = Promise.resolve()
  public requests = 0
  public cacheHits = 0

  constructor(private readonly opts: HttpClientOptions = {}) {}

  get(url: string): Promise<FetchResult> {
    // Serializamos todas las peticiones: el scraper es deliberadamente secuencial.
    const run = this.queue.then(() => this.doGet(url))
    this.queue = run.catch(() => undefined)
    return run
  }

  private cachePath(url: string): string | undefined {
    if (!this.opts.cacheDir) return undefined
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
    const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80)
    return path.join(this.opts.cacheDir, `${name}_${hash}.html`)
  }

  private readCache(url: string): FetchResult | undefined {
    const file = this.cachePath(url)
    const ttl = this.opts.cacheTtlMs ?? 0
    if (!file || ttl <= 0 || !fs.existsSync(file)) return undefined
    const age = Date.now() - fs.statSync(file).mtimeMs
    if (age > ttl) return undefined
    this.cacheHits++
    return { url, finalUrl: url, status: 200, body: fs.readFileSync(file, 'utf8'), fromCache: true }
  }

  private writeCache(url: string, body: string) {
    const file = this.cachePath(url)
    if (!file) return
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }

  private async doGet(url: string): Promise<FetchResult> {
    const cached = this.readCache(url)
    if (cached) return cached

    const host = new URL(url).host
    const minDelay = this.opts.minDelayMs ?? 1000
    const retries = this.opts.retries ?? 3
    let lastError: unknown

    for (let attempt = 0; attempt <= retries; attempt++) {
      const wait = (this.lastRequestAt.get(host) ?? 0) + minDelay - Date.now()
      if (wait > 0) await sleep(wait)
      this.lastRequestAt.set(host, Date.now())
      this.requests++

      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
          headers: {
            'User-Agent': this.opts.userAgent ?? DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'es-ES,es;q=0.9'
          }
        })
        const body = await res.text()
        if (res.ok) {
          this.writeCache(url, body)
          return { url, finalUrl: res.url || url, status: res.status, body, fromCache: false }
        }
        lastError = new HttpError(url, res.status)
        // 4xx (salvo 429) no se arreglan reintentando.
        if (res.status < 500 && res.status !== 429) throw lastError
        if (attempt === retries) break
        const retryAfter = Number(res.headers.get('retry-after'))
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 2000
        this.opts.log?.(`  ↻ ${res.status} en ${url}, reintento en ${Math.round(backoff / 1000)}s`)
        await sleep(backoff)
      } catch (err) {
        if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err
        lastError = err
        if (attempt < retries) {
          const backoff = 2 ** attempt * 2000
          this.opts.log?.(`  ↻ error de red en ${url} (${(err as Error).message}), reintento en ${backoff / 1000}s`)
          await sleep(backoff)
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`No se pudo descargar ${url}`)
  }
}
