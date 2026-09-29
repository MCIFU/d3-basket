/** URLs públicas de baloncestoenvivo.feb.es. */
export const FEB_BASE = 'https://baloncestoenvivo.feb.es'

/** Competiciones FEB soportadas: código interno → grupo (g) de la web de la FEB. */
export const FEB_COMPETITIONS = {
  LEB_ORO: { g: 1, name: 'Primera FEB' },
  LEB_PLATA: { g: 2, name: 'Segunda FEB' },
  TERCERA_FEB: { g: 3, name: 'Tercera FEB' },
  /** Copa España de la FEB: fase de grupos (Segunda FEB) y eliminatorias (también con equipos de Primera). */
  COPA_ESPANA: { g: 73, name: 'Copa España' }
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
