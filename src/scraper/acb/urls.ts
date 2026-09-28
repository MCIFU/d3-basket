/** URLs públicas de acb.com (web nueva, 2025+). */
export const ACB_BASE = 'https://acb.com'
export const ACB_LIVE_BASE = 'https://live.acb.com'

const q = (editionId?: string) => (editionId ? `?editionId=${editionId}` : '')

export const acbUrls = {
  calendar: () => `${ACB_BASE}/es/liga/calendario`,
  /** El slug es obligatorio en subpáginas: con uno incorrecto la web redirige a la portada del club. */
  team: (slug: string, editionId?: string) => `${ACB_BASE}/es/liga/equipos/${slug}${q(editionId)}`,
  /** Cualquier slug sirve: la web redirige al canónico. Útil para descubrir el slug de un club. */
  teamBySlugless: (clubId: string) => `${ACB_BASE}/es/liga/equipos/club-${clubId}`,
  roster: (slug: string, editionId?: string) => `${ACB_BASE}/es/liga/equipos/${slug}/plantilla${q(editionId)}`,
  teamGames: (slug: string, editionId?: string) => `${ACB_BASE}/es/liga/equipos/${slug}/partidos${q(editionId)}`,
  player: (playerId: string, editionId?: string) => `${ACB_BASE}/es/liga/jugadores/jugador-${playerId}${q(editionId)}`,
  game: (gameId: string) => `${ACB_LIVE_BASE}/es/partidos/${gameId}/resumen`,
  boxscore: (gameId: string) => `${ACB_LIVE_BASE}/es/partidos/${gameId}/estadisticas`
}

/** Extrae el slug canónico ("real-madrid-9") de una URL final tras redirección. */
export function slugFromTeamUrl(url: string): string | undefined {
  return /\/es\/liga\/equipos\/([a-z0-9-]+-\d+)/.exec(url)?.[1]
}

export const acbHistoryUrls = {
  clubRanking: (onlyAcb = false) => `${ACB_BASE}/es/liga/estadisticas/ranking-de-clubes${onlyAcb ? '?onlyACB=true' : ''}`,
  honoursBoard: () => `${ACB_BASE}/es/liga/estadisticas/cuadro-de-honor`,
  playerSeasonGames: (playerId: string, editionId: string) =>
    `${ACB_BASE}/es/liga/jugadores/jugador-${playerId}/partidos?editionId=${editionId}`
}
