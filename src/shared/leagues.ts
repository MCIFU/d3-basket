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
  // Campeonatos de España de formación (FEB): azul marino y naranja de sus logos oficiales.
  CESA_INF_M: {
    name: 'CESA Infantil M',
    division: 'Campeonato · Selecciones autonómicas',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/cesa_inf_m.png',
    zones: []
  },
  CESA_INF_F: {
    name: 'CESA Infantil F',
    division: 'Campeonato · Selecciones autonómicas',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/cesa_inf_f.png',
    zones: []
  },
  CESA_CAD_M: {
    name: 'CESA Cadete M',
    division: 'Campeonato · Selecciones autonómicas',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/cesa_cad_m.png',
    zones: []
  },
  CESA_CAD_F: {
    name: 'CESA Cadete F',
    division: 'Campeonato · Selecciones autonómicas',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/cesa_cad_f.png',
    zones: []
  },
  CE_JUN_M: {
    name: 'Junior M',
    division: 'Campeonato · Clubes',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/ce_jun_m.png',
    zones: []
  },
  CE_JUN_F: {
    name: 'Junior F',
    division: 'Campeonato · Clubes',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/ce_jun_f.png',
    zones: []
  },
  CE_CAD_M: {
    name: 'Cadete M',
    division: 'Campeonato · Clubes',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/ce_cad_m.png',
    zones: []
  },
  CE_CAD_F: {
    name: 'Cadete F',
    division: 'Campeonato · Clubes',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/ce_cad_f.png',
    zones: []
  },
  CE_INF_M: {
    name: 'Infantil M',
    division: 'Campeonato · Clubes',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/ce_inf_m.png',
    zones: []
  },
  CE_INF_F: {
    name: 'Infantil F',
    division: 'Campeonato · Clubes',
    color: '#1b2d4f',
    color2: '#f26b1d',
    ink: '#ffffff',
    logo: 'media/leagues/ce_inf_f.png',
    zones: []
  },
  // Europa: colores de las marcas de Euroleague Basketball (naranja EuroLeague, azul EuroCup).
  EUROLEAGUE: {
    name: 'EuroLeague',
    division: 'Europa · Euroleague Basketball',
    color: '#f05a22',
    color2: '#111111',
    ink: '#ffffff',
    logo: 'media/leagues/euroleague.png',
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
    logo: 'media/leagues/eurocup.png',
    zones: [{ from: 1, to: 8, kind: 'playoff', label: 'Eliminatorias (por grupo)' }]
  },
  // Ligas nacionales: colores de la identidad de cada liga.
  LBA: {
    name: 'Serie A',
    division: 'Europa · Italia',
    color: '#00205b',
    color2: '#e4002b',
    ink: '#ffffff',
    logo: 'media/leagues/lba.png',
    zones: [{ from: 1, to: 8, kind: 'playoff', label: 'Playoff por el título' }, { from: -1, to: -1, kind: 'down', label: 'Descenso a Serie A2' }]
  },
  ITA_A2: {
    name: 'Serie A2',
    division: 'Europa · Italia',
    color: '#0b3d91',
    color2: '#f39200',
    ink: '#ffffff',
    logo: 'media/leagues/ita_a2.svg',
    zones: []
  },
  LNB_ELITE: {
    name: 'Betclic Élite',
    division: 'Europa · Francia',
    color: '#0d1e3d',
    color2: '#ff4b1f',
    ink: '#ffffff',
    logo: 'media/leagues/lnb_elite.png',
    zones: [{ from: 1, to: 6, kind: 'playoff', label: 'Playoff' }, { from: 7, to: 10, kind: 'up', label: 'Play-in' }, { from: -2, to: -1, kind: 'down', label: 'Descenso a Élite 2' }]
  },
  LNB_ELITE2: {
    name: 'Élite 2',
    division: 'Europa · Francia',
    color: '#3b1f6b',
    color2: '#ff4b1f',
    ink: '#ffffff',
    logo: 'media/leagues/lnb_elite2.png',
    zones: []
  },
  BBL: {
    name: 'BBL',
    division: 'Europa · Alemania',
    color: '#002d5a',
    color2: '#ff6c00',
    ink: '#ffffff',
    logo: 'media/leagues/bbl.svg',
    zones: [{ from: 1, to: 6, kind: 'playoff', label: 'Playoff' }, { from: 7, to: 10, kind: 'up', label: 'Play-in' }, { from: -2, to: -1, kind: 'down', label: 'Descenso a ProA' }]
  },
  PROA: {
    name: 'ProA',
    division: 'Europa · Alemania',
    color: '#1d1d1b',
    color2: '#e30613',
    ink: '#ffffff',
    logo: 'media/leagues/proa.png',
    zones: []
  },
  GBL: {
    name: 'GBL',
    division: 'Europa · Grecia',
    color: '#0d5eaf',
    color2: '#111111',
    ink: '#ffffff',
    logo: 'media/leagues/gbl.png',
    zones: [{ from: 1, to: 8, kind: 'playoff', label: 'Playoff' }]
  },
  BSL: {
    name: 'Süper Lig',
    division: 'Europa · Turquía',
    color: '#c8102e',
    color2: '#0b1f3a',
    ink: '#ffffff',
    logo: 'media/leagues/bsl.png',
    zones: [
      { from: 1, to: 8, kind: 'playoff', label: 'Playoff' },
      { from: -2, to: -1, kind: 'down', label: 'Descenso' }
    ]
  },
  // Azul marino y amarillo de la marca Basketball Champions League (FIBA).
  BCL: {
    name: 'Champions League',
    division: 'Europa · FIBA',
    color: '#1b2a6b',
    color2: '#f6c400',
    ink: '#ffffff',
    logo: 'media/leagues/bcl.png',
    zones: [
      { from: 1, to: 1, kind: 'playoff', label: 'Cuartos de final directos' },
      { from: 2, to: 3, kind: 'up', label: 'Play-in' }
    ]
  }
}

export const leagueTheme = (code?: string | null): LeagueTheme | undefined => (code ? LEAGUES[code.toUpperCase()] : undefined)

/** Zona de una posición (1..n) en una liga de `n` equipos. */
export function zoneOf(zones: Zone[], position: number, n: number): Zone | undefined {
  const abs = (p: number) => (p < 0 ? n + 1 + p : p)
  return zones.find((z) => position >= abs(z.from) && position <= abs(z.to))
}
