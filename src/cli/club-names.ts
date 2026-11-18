/** Limpieza del nombre legal de un club (FEB) para mostrarlo en la web. */
const FORMS: [RegExp, string][] = [
  [/^CLUB (DE )?BALONCESTO\b/, 'CB'],
  [/^CLUB (DE )?B[AÀ]SQUET(BOL)?\b/, 'CB'],
  [/^CLUB DEPORTIVO\b/, 'CD'],
  [/^CLUB DEPORTIU\b/, 'CD'],
  [/^CLUB ESPORTIU\b/, 'CE'],
  [/^AGRUPACI[OÓ]N DEPORTIVA\b/, 'AD'],
  [/^ASOCIACI[OÓ]N DEPORTIVA\b/, 'AD'],
  [/^UNI[OÓ]N DEPORTIVA\b/, 'UD'],
  [/^SOCIEDAD DEPORTIVA\b/, 'SD'],
  [/^C\.\s?B\.?(?=\s)/, 'CB'],
  [/^C\.\s?D\.?(?=\s)/, 'CD'],
  [/^C\.\s?E\.?(?=\s)/, 'CE']
]
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'i', 'a', 'en', 'al', 'les', 'dels', 'per'])
const KEEP = new Set(['CB', 'CD', 'CE', 'AD', 'UD', 'SD', 'UE', 'BC', 'CBC', 'ADC', 'UCAM', 'CDEB', 'CDB', 'CBA', 'AE', 'CEB', 'SAD', 'UB', 'EBG', 'CP', 'CN', 'NC', 'AA', 'CF'])

/** "CLUB BALONCESTO VILLA DE LOS BARRIOS SAD" → "CB Villa de los Barrios". */
export function legalName(raw: string): string | undefined {
  let s = raw.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().toUpperCase()
  if (s.length < 3) return undefined
  // Forma jurídica final (SAD, SL, SA) y la inicial abreviada (Club Baloncesto → CB).
  s = s.replace(/[,.]?\s*\b(S\.?\s?A\.?\s?D\.?|S\.?\s?L\.?|S\.?\s?A\.?)$/, '').trim()
  // Siglas con puntos pegadas a la palabra siguiente ("C.B.GRAN CANARIA") y siglas con puntos ("A.D." → "AD").
  s = s.replace(/^((?:[A-Z]\.){2,})(?=[A-Z]{2})/, '$1 ')
  for (const [re, to] of FORMS) s = s.replace(re, to)
  s = s
    .split(' ')
    .map((w) => (/^(?:[A-Z]\.){2,}[A-Z]?\.?$/.test(w) ? w.replace(/\./g, '') : w))
    .join(' ')
  return s
    .split(' ')
    .map((w, i) => {
      if (KEEP.has(w)) return w
      const l = w.toLowerCase()
      if (i > 0 && SMALL.has(l)) return l
      return l.replace(/^(l'|d')?(\p{L})/u, (_m, p: string | undefined, c: string) => (p === "l'" ? "L'" : p ?? '') + c.toUpperCase())
    })
    .join(' ')
}

/** Nombre corto: sin la forma jurídica inicial y, si es largo, las primeras palabras con contenido. */
export function shortName(name: string): string {
  const s = name.replace(/^(CB|CD|CE|AD|UD|SD|CDEB|CDB|CBA|AE|CEB|Club|Fundaci[oó]n|Fundaci[oó]|Asociaci[oó]n)\s+/, '')
  if (s.length <= 22) return s
  const words = s.split(' ')
  let out = ''
  for (const w of words) {
    if ((out + ' ' + w).trim().length > 22) break
    out = (out + ' ' + w).trim()
  }
  return out.replace(/\s+(de|del|la|las|los|el|y|i)$/, '')
}
