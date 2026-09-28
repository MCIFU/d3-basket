/**
 * Parser del "flight payload" de React Server Components (Next.js App Router).
 *
 * Las páginas nuevas de acb.com (desde 2025) no pintan los datos en tablas HTML
 * estables: los envían serializados dentro de <script>self.__next_f.push([1,"..."])</script>.
 * Leer ese payload es mucho más robusto que parsear el DOM, porque los nombres de
 * las propiedades (homeTeam, shirtNumber, statsByPeriods...) cambian mucho menos que
 * las clases CSS.
 *
 * Formato (simplificado) del payload, una fila por línea:
 *   <idHex>:<JSON>             -> modelo
 *   <idHex>:I[...]             -> import de módulo cliente (ignorado)
 *   <idHex>:HL[...]            -> hint de recursos (ignorado)
 *   <idHex>:T<lenHex>,<texto>  -> texto de longitud fija en bytes UTF-8
 * Dentro de los modelos, las cadenas que empiezan por "$" son referencias:
 *   "$undefined", "$$" (dólar literal), "$D<fecha>", "$n<bigint>",
 *   "$<idHex>" o "$<idHex>:ruta:a:la:propiedad" (referencia a otra fila).
 */

export interface ReactElementNode {
  $$typeof: 'react.element'
  type: unknown
  key: string | null
  props: Record<string, unknown>
}

export type RscRows = Map<string, unknown>

const PUSH_RE = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g

/** Concatena todos los fragmentos `self.__next_f.push([1, "..."])` de un HTML. */
export function extractFlightPayload(html: string): string {
  let out = ''
  for (const m of html.matchAll(PUSH_RE)) {
    out += JSON.parse(`"${m[1]}"`) as string
  }
  return out
}

/** Divide el payload en filas `id -> valor JSON sin resolver`. */
export function parseFlightRows(payload: string): RscRows {
  const buf = Buffer.from(payload, 'utf8')
  const rows: RscRows = new Map()
  let pos = 0
  while (pos < buf.length) {
    const colon = buf.indexOf(0x3a /* : */, pos)
    if (colon === -1) break
    const id = buf.toString('utf8', pos, colon).trim()
    let cursor = colon + 1

    if (buf[cursor] === 0x54 /* T */) {
      // Fila de texto: T<longitud hex>,<bytes>
      const comma = buf.indexOf(0x2c /* , */, cursor)
      const len = parseInt(buf.toString('utf8', cursor + 1, comma), 16)
      const start = comma + 1
      rows.set(id, buf.toString('utf8', start, start + len))
      pos = start + len
      continue
    }

    const nl = buf.indexOf(0x0a /* \n */, cursor)
    const end = nl === -1 ? buf.length : nl
    const line = buf.toString('utf8', cursor, end)
    pos = end + 1

    if (!/^[0-9a-f]+$/i.test(id)) continue
    const first = line[0]
    if (first === '[' || first === '{' || first === '"' || /^[-\d]|^(true|false|null)$/.test(line)) {
      try {
        rows.set(id, JSON.parse(line))
      } catch {
        // Fila corrupta o truncada: la ignoramos para no romper el resto.
      }
    }
    // Filas I[...], HL[...], E{...} etc. no contienen datos útiles.
  }
  return rows
}

/**
 * Resuelve referencias "$..." de forma perezosa y memoizada.
 * Los arrays ["$", tipo, key, props] se convierten en objetos elemento
 * ({ type, key, props }) para que rutas como "$2d:props:data:teams:14" funcionen.
 */
/** Referencia a una fila que aún se está resolviendo (p.ej. auto-referencias). */
class PendingRef {
  constructor(
    readonly id: string,
    readonly path: string[]
  ) {}
}

interface Fixup {
  container: Record<string | number, unknown>
  key: string | number
  ref: PendingRef
}

export class RscDocument {
  private resolved = new Map<string, unknown>()
  private resolving = new Set<string>()
  private fixups: Fixup[] = []

  constructor(public readonly rows: RscRows) {}

  static fromHtml(html: string): RscDocument {
    return new RscDocument(parseFlightRows(extractFlightPayload(html)))
  }

  get size(): number {
    return this.rows.size
  }

  row(id: string): unknown {
    if (this.resolved.has(id)) return this.resolved.get(id)
    if (!this.rows.has(id)) return undefined
    this.resolving.add(id)
    const value = this.resolveValue(this.rows.get(id))
    this.resolving.delete(id)
    this.resolved.set(id, value)
    // Parchea las referencias que apuntaban a esta fila mientras se construía.
    const ready = this.fixups.filter((f) => this.resolved.has(f.ref.id))
    this.fixups = this.fixups.filter((f) => !this.resolved.has(f.ref.id))
    for (const f of ready) f.container[f.key] = walk(this.resolved.get(f.ref.id), f.ref.path)
    return value
  }

  /** Todas las filas resueltas (útil para búsquedas globales). */
  roots(): unknown[] {
    return [...this.rows.keys()].map((id) => this.row(id))
  }

  private resolveValue(value: unknown): unknown {
    if (typeof value === 'string') return this.resolveString(value)
    if (Array.isArray(value)) {
      if (value[0] === '$' && value.length >= 4 && typeof value[1] === 'string') {
        const el: ReactElementNode = {
          $$typeof: 'react.element',
          type: this.resolveValue(value[1]),
          key: (value[2] as string | null) ?? null,
          props: {}
        }
        const props = this.resolveValue(value[3])
        if (props instanceof PendingRef) this.fixups.push({ container: el as never, key: 'props', ref: props })
        else el.props = (props as Record<string, unknown>) ?? {}
        return el
      }
      const out: unknown[] = []
      value.forEach((v, i) => this.assign(out as never, i, this.resolveValue(v)))
      return out
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) this.assign(out, k, this.resolveValue(v))
      return out
    }
    return value
  }

  private assign(container: Record<string | number, unknown>, key: string | number, v: unknown) {
    if (v instanceof PendingRef) {
      container[key] = undefined
      this.fixups.push({ container, key, ref: v })
    } else {
      container[key] = v
    }
  }

  private resolveString(s: string): unknown {
    if (s[0] !== '$') return s
    if (s === '$undefined') return undefined
    if (s === '$$' || s.startsWith('$$')) return s.slice(1)
    if (s === '$NaN') return NaN
    if (s === '$Infinity') return Infinity
    if (s === '$-Infinity') return -Infinity
    if (s === '$-0') return -0
    if (s.startsWith('$D')) return s.slice(2) // fecha ISO: la dejamos como texto
    if (s.startsWith('$n')) return Number(s.slice(2))
    // $L (lazy client component), $@ (promesa), $S (symbol), $F (server ref)... usan
    // mayúsculas o símbolos; los ids de fila son siempre hex en minúsculas.
    const m = /^\$([0-9a-f]+)((?::[^:]+)*)$/.exec(s)
    if (!m) return s
    const path = m[2] ? m[2].slice(1).split(':') : []
    // Auto-referencia o ciclo: se resolverá cuando la fila termine de construirse.
    if (this.resolving.has(m[1])) return new PendingRef(m[1], path)
    return walk(this.row(m[1]), path)
  }
}

function walk(target: unknown, path: string[]): unknown {
  for (const key of path) {
    if (target == null) return undefined
    target = (target as Record<string, unknown>)[key]
  }
  return target
}

type Predicate = (node: Record<string, any>) => unknown

/**
 * Recorre el árbol resuelto y devuelve los objetos que cumplen el predicado.
 * Evita ciclos y no desciende dentro de los objetos encontrados (salvo `deep`).
 */
export function findObjects<T = Record<string, unknown>>(
  root: unknown,
  predicate: Predicate,
  opts: { deep?: boolean; limit?: number } = {}
): T[] {
  const out: T[] = []
  const seen = new Set<unknown>()
  const stack: unknown[] = [root]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object' || seen.has(node)) continue
    seen.add(node)
    if (!Array.isArray(node)) {
      const obj = node as Record<string, unknown>
      if (predicate(obj)) {
        out.push(obj as T)
        if (opts.limit && out.length >= opts.limit) break
        if (!opts.deep) continue
      }
      for (const v of Object.values(obj)) if (v && typeof v === 'object') stack.push(v)
    } else {
      for (let i = node.length - 1; i >= 0; i--) {
        const v = node[i]
        if (v && typeof v === 'object') stack.push(v)
      }
    }
  }
  return out
}

/** Busca en todo el documento el primer objeto que tenga todas las claves dadas. */
export function findFirstWithKeys<T = Record<string, unknown>>(
  doc: RscDocument,
  keys: string[]
): T | undefined {
  for (const root of doc.roots()) {
    const [hit] = findObjects<T>(root, (o) => keys.every((k) => k in o), { limit: 1 })
    if (hit) return hit
  }
  return undefined
}

/** Igual que findObjects pero sobre todas las filas del documento. */
export function findAllInDoc<T = Record<string, unknown>>(doc: RscDocument, predicate: Predicate): T[] {
  const out: T[] = []
  const seen = new Set<unknown>()
  for (const root of doc.roots()) {
    for (const hit of findObjects<T>(root, predicate)) {
      if (!seen.has(hit)) {
        seen.add(hit)
        out.push(hit)
      }
    }
  }
  return out
}

export function isElement(v: unknown): v is ReactElementNode {
  return !!v && typeof v === 'object' && (v as ReactElementNode).$$typeof === 'react.element'
}

/** Texto plano de un subárbol de elementos (similar a element.textContent). */
export function textContent(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (isElement(node)) return textContent(node.props.children)
  return ''
}
