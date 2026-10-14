/** Tramo de la clasificación con consecuencias (playoff, ascenso, descenso). */
export interface Zone {
  from: number
  /** Posición final; negativa = contando desde el último (-1 = último). */
  to: number
  kind: 'up' | 'playoff' | 'down'
  label: string
}

export interface LeagueTheme {
  name: string
  /** Categoría en la pirámide del baloncesto español. */
  division: string
  /** Colores oficiales: el de marca y el complementario (web y logo oficiales). */
  color: string
  color2: string
  /** Texto legible sobre `color`. */
  ink: string
  logo: string
  zones: Zone[]
}

/**
 * Identidad oficial de cada liga.
 * - Liga Endesa: paleta de acb.com (--primary-color #da3b00, --secondary-color negro) y su logo.
 * - Primera, Segunda y Tercera FEB: colores de sus logos oficiales (imagenes.feb.es), que comparten
 *   el gris y se distinguen por el color: naranja, rojo y ámbar. Copa España: rojo y amarillo de su logo.
 * Zonas según el formato de la temporada 2026-27 (solo las ligas de grupo único).
 */
export const LEAGUES: Record<string, LeagueTheme> = {
  ACB: {
    name: 'Liga Endesa',
    division: 'Primera división · ACB',
    color: '#da3b00',
    color2: '#0b0a0a',
    ink: '#ffffff',
    logo: 'media/leagues/acb.svg',
    zones: [
      { from: 1, to: 8, kind: 'playoff', label: 'Playoff por el título' },
      { from: -2, to: -1, kind: 'down', label: 'Descenso a Primera FEB' }
    ]
  },
  LEB_ORO: {
    name: 'Primera FEB',
    division: 'Segunda división · FEB',
    color: '#fe6b00',
    color2: '#76777b',
    ink: '#ffffff',
    logo: 'media/leagues/leb_oro.png',
    zones: [
      { from: 1, to: 1, kind: 'up', label: 'Ascenso directo a la ACB' },
      { from: 2, to: 9, kind: 'playoff', label: 'Playoff de ascenso' },
      { from: -2, to: -1, kind: 'down', label: 'Descenso a Segunda FEB' }
    ]
  },
  LEB_PLATA: {
    name: 'Segunda FEB',
    division: 'Tercera división · FEB',
    color: '#f03039',
    color2: '#78777a',
    ink: '#ffffff',
    logo: 'media/leagues/leb_plata.png',
    zones: []
  },
  COPA_ESPANA: {
    name: 'Copa España',
    division: 'Copa · FEB',
    color: '#c53740',
    color2: '#f89d1f',
    ink: '#ffffff',
    logo: 'media/leagues/copa_espana.png',
    zones: []
  },
  TERCERA_FEB: {
    name: 'Tercera FEB',
    division: 'Cuarta división · FEB',
    color: '#ff9f00',
    color2: '#78787c',
    ink: '#241600',
    logo: 'media/leagues/tercera_feb.png',
    zones: []
  },
  // Europa: colores de las marcas de Euroleague Basketball (naranja EuroLeague, azul EuroCup).
  EUROLEAGUE: {
    name: 'EuroLeague',
    division: 'Europa · Euroleague Basketball',
    color: '#f05a22',
    color2: '#111111',
    ink: '#ffffff',
    logo: 'media/leagues/euroleague.svg',
    zones: [
      { from: 1, to: 6, kind: 'playoff', label: 'Playoff' },
      { from: 7, to: 10, kind: 'up', label: 'Play-in' }
    ]
  },
  EUROCUP: {
    name: 'EuroCup',
    division: 'Europa · Euroleague Basketball',
    color: '#1a6fd1',
    color2: '#0d1b3e',
    ink: '#ffffff',
    logo: 'media/leagues/eurocup.svg',
    zones: [{ from: 1, to: 8, kind: 'playoff', label: 'Eliminatorias (por grupo)' }]
  }
}

export const leagueTheme = (code?: string | null): LeagueTheme | undefined => (code ? LEAGUES[code.toUpperCase()] : undefined)

/** Zona de una posición (1..n) en una liga de `n` equipos. */
export function zoneOf(zones: Zone[], position: number, n: number): Zone | undefined {
  const abs = (p: number) => (p < 0 ? n + 1 + p : p)
  return zones.find((z) => position >= abs(z.from) && position <= abs(z.to))
}
