/**
 * Tema claro / oscuro. La preferencia ('system', 'light' o 'dark') se guarda en el navegador y el
 * tema efectivo se aplica como `data-theme` en <html>, de modo que el CSS solo tiene una regla por
 * tema. Con 'system' sigue la preferencia del sistema operativo, también si cambia en caliente.
 */
export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'd3-theme'
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)')

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePref = getThemePref()): 'light' | 'dark' {
  const dark = pref === 'dark' || (pref === 'system' && !!media()?.matches)
  const theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  return theme
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* navegación privada: solo para esta sesión */
  }
  applyTheme(pref)
}

export function initTheme() {
  applyTheme()
  media()?.addEventListener?.('change', () => {
    if (getThemePref() === 'system') applyTheme('system')
  })
}
