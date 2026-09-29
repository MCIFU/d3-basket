import fs from 'node:fs'
import path from 'node:path'
import type { DB } from './database'

/**
 * Recursos gráficos propios (public/media, generados con tools/media/*.py):
 *   players/f<id>.webp  foto en primer plano con fondo transparente (id de la FEB)
 *   logos/<ref>.png     escudo recortado y centrado en 256×256
 *   colors.json         { "<ref>": { primary, secondary } } sacados del escudo
 * Se aplican sobre la base de datos después de cada sincronización y al
 * exportar la web: el scraper vuelve a escribir las URL originales, así que
 * esto debe ejecutarse siempre al final.
 */
export function applyMedia(db: DB, mediaDir: string): { players: number; logos: number; colors: number } {
  const done = { players: 0, logos: 0, colors: 0 }
  if (!fs.existsSync(mediaDir)) return done
  const list = (sub: string, ext: string) => {
    const dir = path.join(mediaDir, sub)
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)) : []
  }
  // Fotos por id de la FEB ('f<id>'): también para jugadores con ficha en acb.com (su ref es la de la ACB).
  const playerId = db.prepare(
    `SELECT entity_id AS id FROM external_ids WHERE entity_type = 'player' AND source = 'feb' AND external_id = ?`
  )
  const clubId = db.prepare('SELECT club_id AS id FROM v_club_ref WHERE ref = ?')
  const current = `club_id = ? AND competition_season_id IN (SELECT id FROM competition_seasons WHERE is_current = 1)`

  db.transaction(() => {
    const setPhoto = db.prepare('UPDATE players SET photo_nobg_url = ? WHERE id = ?')
    for (const file of list('players', '.webp')) {
      const row = playerId.get(path.basename(file, '.webp').replace(/^f/, '')) as { id: number } | undefined
      if (row) done.players += setPhoto.run(`media/players/${file}`, row.id).changes
    }

    const setClubLogo = db.prepare('UPDATE clubs SET logo_url = ? WHERE id = ?')
    const setTeamLogo = db.prepare(`UPDATE teams SET logo_url = ? WHERE ${current}`)
    for (const file of list('logos', '.png')) {
      const row = clubId.get(path.basename(file, '.png')) as { id: number } | undefined
      if (!row) continue
      done.logos += setClubLogo.run(`media/logos/${file}`, row.id).changes
      setTeamLogo.run(`media/logos/${file}`, row.id)
    }

    const colorsFile = path.join(mediaDir, 'colors.json')
    if (fs.existsSync(colorsFile)) {
      const colors = JSON.parse(fs.readFileSync(colorsFile, 'utf8')) as Record<string, { primary?: string; secondary?: string | null }>
      const setClub = db.prepare('UPDATE clubs SET primary_color = COALESCE(?, primary_color), secondary_color = ? WHERE id = ?')
      const setTeam = db.prepare(`UPDATE teams SET primary_color = COALESCE(?, primary_color) WHERE ${current}`)
      for (const [ref, c] of Object.entries(colors)) {
        const row = clubId.get(ref) as { id: number } | undefined
        if (!row) continue
        done.colors += setClub.run(c.primary ?? null, c.secondary ?? null, row.id).changes
        setTeam.run(c.primary ?? null, row.id)
      }
    }
  })()
  return done
}
