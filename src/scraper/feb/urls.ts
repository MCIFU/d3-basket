/** URLs públicas de baloncestoenvivo.feb.es. */
export const FEB_BASE = 'https://baloncestoenvivo.feb.es'

/** Competiciones FEB soportadas: código interno → grupo (g) de la web de la FEB. */
export const FEB_COMPETITIONS = {
  LEB_ORO: { g: 1, name: 'Primera FEB' },
  LEB_PLATA: { g: 2, name: 'Segunda FEB' },
  TERCERA_FEB: { g: 3, name: 'Tercera FEB' },
  /** Copa España de la FEB: fase de grupos (Segunda FEB) y eliminatorias (también con equipos de Primera). */
  COPA_ESPANA: { g: 73, name: 'Copa España' },
  /** Campeonatos de España de selecciones autonómicas (CESA) y de clubes, categorías de formación. */
  CESA_INF_M: { g: 25, name: 'CESA Infantil masculino' },
  CESA_INF_F: { g: 26, name: 'CESA Infantil femenino' },
  CESA_CAD_M: { g: 40, name: 'CESA Cadete masculino' },
  CESA_CAD_F: { g: 41, name: 'CESA Cadete femenino' },
  CE_JUN_M: { g: 21, name: 'Cto. España Junior masculino' },
  CE_JUN_F: { g: 22, name: 'Cto. España Junior femenino' },
  CE_CAD_M: { g: 35, name: 'Cto. España Cadete masculino' },
  CE_CAD_F: { g: 36, name: 'Cto. España Cadete femenino' },
  CE_INF_M: { g: 37, name: 'Cto. España Infantil masculino' },
  CE_INF_F: { g: 38, name: 'Cto. España Infantil femenino' }
} as const
export type FebCompetition = keyof typeof FEB_COMPETITIONS

export const febUrls = {
  calendar: (g: number, startYear: number) => `${FEB_BASE}/calendario.aspx?g=${g}&t=${startYear}`,
  /** Resultados por jornada: incluye las eliminatorias, que no salen en el calendario. */
  results: (g: number, startYear: number) => `${FEB_BASE}/resultados.aspx?g=${g}&t=${startYear}`,
  team: (teamId: string) => `${FEB_BASE}/Equipo.aspx?i=${teamId}`,
  game: (gameId: string) => `${FEB_BASE}/Partido.aspx?p=${gameId}`,
  player: (teamId: string, personId: string) => `${FEB_BASE}/Jugador.aspx?i=${teamId}&c=${personId}`,
  /** Foto oficial (PNG con fondo transparente). */
  photo: (personId: string) => `https://imagenes.feb.es/Foto.aspx?c=${personId}`,
  logo: (teamId: string) => `https://imagenes.feb.es/Imagen.aspx?i=${teamId}&ti=1`
}
