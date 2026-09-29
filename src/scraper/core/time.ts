/** Fecha y hora locales de España ("26/09/2026", "19:00") → ISO UTC ("2026-09-26T17:00:00Z"). */
export function madridToUtc(date: string, time = '12:00'): string | undefined {
  const d = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(date)
  if (!d) return undefined
  const t = /(\d{1,2}):(\d{2})/.exec(time) ?? ['', '12', '00']
  const [y, mo, da, h, mi] = [Number(d[3]), Number(d[2]), Number(d[1]), Number(t[1]), Number(t[2])]
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  // Desfase de Europe/Madrid en ese instante (1 h en invierno, 2 h en verano).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value])
  )
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
  const offset = asLocal - guess
  return new Date(guess - offset).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** "15/11/1987" → "1987-11-15" */
export function dmyToIso(v: string | undefined): string | undefined {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v ?? '')
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined
}
