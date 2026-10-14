/**
 * Fotos y escudos empaquetados para la versión que se abre dentro de Claude (artifact).
 *
 * Ese visor admite como mucho unos cientos de ficheros por página y solo carga imágenes
 * propias, así que las ~4.700 fotos viajan en paquetes (`media/packs/*`, agrupadas
 * por equipo) con un índice `media/pack-index.json` { ruta: [paquete, inicio, bytes, tipo] }.
 *
 * Las rutas `media/...` que devuelve la API se cambian por un píxel transparente que lleva
 * la ruta real tras `#`. Cuando la imagen entra en pantalla se descarga su paquete (una sola
 * vez) y se le pone la imagen de verdad como `blob:`. Así el índice de jugadores no
 * descarga los 77 MB de golpe, solo lo que se ve.
 */
import type { D3Api } from '../../../shared/api'

type Entry = [pack: string, offset: number, length: number, type: string]
type Index = Record<string, Entry>

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#'

let index: Index = {}
const packs = new Map<string, Promise<ArrayBuffer>>()
const blobs = new Map<string, Promise<string>>()

const loadPack = (name: string) => {
  let p = packs.get(name)
  if (!p) {
    p = fetch(new URL(`media/packs/${name}`, document.baseURI)).then((r) => {
      if (!r.ok) throw new Error(`paquete ${name}: ${r.status}`)
      return r.arrayBuffer()
    })
    p.catch(() => packs.delete(name)) // reintento en la siguiente imagen
    packs.set(name, p)
  }
  return p
}

function blobUrl(path: string): Promise<string> | undefined {
  const e = index[path]
  if (!e) return undefined
  let u = blobs.get(path)
  if (!u) {
    const [pack, offset, length, type] = e
    u = loadPack(pack).then((buf) => URL.createObjectURL(new Blob([buf.slice(offset, offset + length)], { type })))
    blobs.set(path, u)
  }
  return u
}

/** Sustituye en profundidad las rutas empaquetadas por el marcador. */
function mark<T>(value: T): T {
  if (typeof value === 'string') return (index[value] ? PIXEL + value : value) as T
  if (Array.isArray(value)) return value.map(mark) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = mark(v)
    return out as T
  }
  return value
}

function watchImages() {
  const pending = (img: HTMLImageElement) => img.getAttribute('src')?.startsWith(PIXEL)
  const load = (img: HTMLImageElement) => {
    const src = img.getAttribute('src')!
    blobUrl(src.slice(PIXEL.length))
      ?.then((url) => {
        if (img.getAttribute('src') === src) img.src = url
      })
      .catch(() => img.dispatchEvent(new Event('error')))
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io.unobserve(e.target)
        const img = e.target as HTMLImageElement
        if (pending(img)) load(img)
      }
    },
    { rootMargin: '300px' }
  )
  const scan = (root: ParentNode) => root.querySelectorAll?.('img').forEach((img) => pending(img) && io.observe(img))
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') {
        const img = m.target as HTMLImageElement
        if (pending(img)) io.observe(img)
      } else m.addedNodes.forEach((n) => n instanceof Element && (n instanceof HTMLImageElement ? pending(n) && io.observe(n) : scan(n)))
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
  scan(document)
}

export async function withMediaPack(api: D3Api): Promise<D3Api> {
  try {
    const r = await fetch(new URL('media/pack-index.json', document.baseURI))
    if (r.ok) index = (await r.json()) as Index
  } catch {
    // Sin índice: las imágenes se piden por su ruta normal.
  }
  if (!Object.keys(index).length) return api
  watchImages()
  const wrapped = { ...api } as Record<string, unknown>
  for (const [k, fn] of Object.entries(api)) {
    if (typeof fn === 'function' && k !== 'onSyncProgress')
      wrapped[k] = async (...args: unknown[]) => mark(await (fn as (...a: unknown[]) => Promise<unknown>).apply(api, args))
  }
  return wrapped as unknown as D3Api
}
