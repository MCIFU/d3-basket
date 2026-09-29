import type { CSSProperties } from 'react'
import { mix } from './format'

export { LEAGUES, leagueTheme, zoneOf, type LeagueTheme, type Zone } from '../../shared/leagues'

/** Variables CSS para teñir una página con el color de la liga (pestañas, titulillos, enlaces...). */
export function brandVars(color: string, color2?: string): CSSProperties {
  return {
    ['--brand' as string]: color,
    ['--brand-2' as string]: mix(color, '#ffffff', 0.25),
    ['--brand-soft' as string]: mix(color, '#ffffff', 0.9),
    ['--brand-ink' as string]: mix(color, '#000000', 0.25),
    ['--accent-2' as string]: color2 ?? color
  }
}
