/** Número de cubos por tipo de fichero (jugadores, clubes, partidos, cara a cara entre clubes). Compartido con tools/site/export.ts. */
export const BUCKETS = { p: 1024, c: 256, g: 1024, h: 512 } as const

/** Cubo de una referencia: hash FNV-1a de 32 bits. */
export function bucketOf(ref: string, n: number): number {
  let h = 0x811c9dc5
  for (let i = 0; i < ref.length; i++) {
    h ^= ref.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % n
}
