import fs from 'node:fs'
import path from 'node:path'
import type { DB } from './database'

/**
 * Recursos gráficos propios (public/media, generados con tools/media/*.py):
 *   players/f<id>.webp  foto en primer plano con fondo transparente (id de la FEB)
 *   logos/<ref>.png     escudo recortado y centrado en 256×256
 *   colors.json         { "<ref>": { primary, secondary } } sacados del escudo
 *   photos-dead.txt     fotos oficiales vacías o genéricas (tools/media/check_photos.mjs): se quitan
 *   filiales.json       { "<ref del filial>": { ref: "<ref del primer equipo>" } } (tools/media/filiales.mjs)
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
    fillClubInfo(db)
    fixBirthDates(db)
    fillValuation(db)
    const filialesFile = path.join(mediaDir, 'filiales.json')
    if (fs.existsSync(filialesFile)) {
      const byRef = db.prepare(
        `SELECT COALESCE((SELECT club_id FROM v_club_ref WHERE ref = @ref),
           (SELECT entity_id FROM external_ids WHERE entity_type = 'club' AND source = 'feb' AND 'f' || external_id = @ref),
           (SELECT entity_id FROM external_ids WHERE entity_type = 'club' AND source = 'acb' AND external_id = @ref)) AS id`
      )
      const setParent = db.prepare('UPDATE clubs SET parent_club_id = ? WHERE id = ? AND id != ?')
      db.prepare('UPDATE clubs SET parent_club_id = NULL').run()
      const list = JSON.parse(fs.readFileSync(filialesFile, 'utf8')) as Record<string, { ref: string }>
      for (const [child, { ref }] of Object.entries(list)) {
        const c = (byRef.get({ ref: child }) as { id: number | null }).id
        const p = (byRef.get({ ref }) as { id: number | null }).id
        if (c && p) setParent.run(p, c, p)
      }
    }
    // Sin foto oficial válida en acb.com o la FEB, sin foto.
    const deadFile = path.join(mediaDir, 'photos-dead.txt')
    if (fs.existsSync(deadFile)) {
      const clear = ['photo_url', 'photo_nobg_url', 'body_photo_url'].map((c) => db.prepare(`UPDATE players SET ${c} = NULL WHERE ${c} = ?`))
      for (const url of fs.readFileSync(deadFile, 'utf8').split('\n')) if (url) for (const q of clear) q.run(url)
    }
    // Sin pisar la foto oficial de acb.com de quien también tiene ficha en la ACB.
    const setPhoto = db.prepare(
      `UPDATE players SET photo_nobg_url = ? WHERE id = ? AND (photo_nobg_url IS NULL OR photo_nobg_url LIKE '%feb.es%' OR photo_nobg_url LIKE 'media/%')`
    )
    for (const file of list('players', '.webp')) {
      const row = playerId.get(path.basename(file, '.webp').replace(/^f/, '')) as { id: number } | undefined
      if (row) done.players += setPhoto.run(`media/players/${file}`, row.id).changes
    }

    const setClubLogo = db.prepare('UPDATE clubs SET logo_url = ? WHERE id = ?')
    // Temporada en curso y, en temporadas pasadas, los equipos FEB (la FEB solo tiene el escudo
    // actual; los escudos históricos de acb.com sí se conservan).
    const setTeamLogo = db.prepare(
      `UPDATE teams SET logo_url = ? WHERE club_id = ? AND (logo_url IS NULL OR logo_url LIKE '%feb.es%'
         OR competition_season_id IN (SELECT id FROM competition_seasons WHERE is_current = 1))`
    )
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
    // Al final, para que no la devuelvan las fotos locales.
    hideMinorsPhotos(db)
  })()
  return done
}

/**
 * Ciudad y provincia del club a partir de la dirección del pabellón que publica la FEB
 * ('… 28522 Rivas-Vaciamadrid (Madrid)'), y webs que no son una dirección ('WEB', 'Nº Reg. …').
 */
function fillClubInfo(db: DB) {
  const rows = db.prepare('SELECT id, arena_address AS addr FROM clubs WHERE arena_address IS NOT NULL').all() as { id: number; addr: string }[]
  const set = db.prepare('UPDATE clubs SET city = ? WHERE id = ?')
  // 'Palmas de Gran Canaria, Las' → 'Las Palmas de Gran Canaria'
  const flip = (s: string) => s.trim().replace(/^(.+),\s*(el|la|los|las|l'|els|les|es|sa|o|a|as|os)$/i, (_, a, b) => `${b[0].toUpperCase()}${b.slice(1)}${b.endsWith("'") ? '' : ' '}${a}`)
  for (const r of rows) {
    const m = /^.*\b\d{5}\s+(.+?)\s*\(([^)]+)\)\s*$/.exec(r.addr)
    if (!m) continue
    const title = (x: string) => (x === x.toUpperCase() ? x.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : x)
    const town = title(flip(m[1]))
    const province = flip(m[2])
    set.run(town === province ? town : `${town} (${province})`, r.id)
  }
  db.prepare(`UPDATE clubs SET website = NULL WHERE website IS NOT NULL AND (website NOT LIKE '%.%' OR website LIKE '% %')`).run()
}

/**
 * Fechas de nacimiento imposibles (la FEB publica algunas como 2022): un jugador con partidos
 * oficiales no puede tener menos de 13 años. Sin una fecha creíble, mejor en blanco.
 */
/**
 * Sin foto para quien solo ha jugado campeonatos de España de formación (menores de edad). En
 * cuanto juega con un equipo de una liga sénior, su foto vuelve en la siguiente sincronización.
 */
function hideMinorsPhotos(db: DB) {
  db.prepare(
    `UPDATE players SET photo_url = NULL, photo_nobg_url = NULL, body_photo_url = NULL
     WHERE (photo_url IS NOT NULL OR photo_nobg_url IS NOT NULL OR body_photo_url IS NOT NULL)
       AND id IN (SELECT r.player_id FROM roster_entries r JOIN teams t ON t.id = r.team_id
                  JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN competitions c ON c.id = cs.competition_id
                  WHERE c.code LIKE 'CE\\_%' ESCAPE '\\' OR c.code LIKE 'CESA\\_%' ESCAPE '\\')
       AND id NOT IN (SELECT r.player_id FROM roster_entries r JOIN teams t ON t.id = r.team_id
                  JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN competitions c ON c.id = cs.competition_id
                  WHERE c.code NOT LIKE 'CE\\_%' ESCAPE '\\' AND c.code NOT LIKE 'CESA\\_%' ESCAPE '\\')`
  ).run()
}

/** Valoración (PIR) cuando la fuente no la publica (Sofascore, ProA): fórmula estándar. */
function fillValuation(db: DB) {
  db.prepare(
    `UPDATE player_game_stats SET pir = points + reb + ast + stl + blk + fouls_drawn
       - (fg2a - fg2m) - (fg3a - fg3m) - (fta - ftm) - tov - pf - blk_against
     WHERE pir IS NULL`
  ).run()
}

function fixBirthDates(db: DB) {
  db.prepare(
    `UPDATE players SET birth_date = NULL WHERE birth_date IS NOT NULL AND (
       CAST(substr(birth_date, 1, 4) AS INTEGER) > CAST(strftime('%Y', 'now') AS INTEGER) - 13
       OR CAST(substr(birth_date, 1, 4) AS INTEGER) < 1940)`
  ).run()
}
