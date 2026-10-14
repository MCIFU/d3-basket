/**
 * Propone filiales: clubes de una categoría inferior que comparten jugadores (en actas de la
 * misma temporada) con uno de categoría superior, o que llevan su nombre ("Amics Castelló B").
 * Escribe tools/media/filiales-candidatos.json para revisarlo a mano; la lista buena va en
 * public/media/filiales.json ({ "<ref del filial>": "<ref del primer equipo>" }) y la aplica
 * src/db/media.ts.
 *
 *   node tools/media/filiales.mjs [--db data/d3basket.db]
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const args = process.argv.slice(2)
const db = new Database(args.includes('--db') ? args[args.indexOf('--db') + 1] : 'data/d3basket.db', { readonly: true })
const dir = path.dirname(new URL(import.meta.url).pathname)

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/["'´`·.]/g, ' ')
    .replace(/\b(c ?b|club|baloncesto|basket|basquet|fundacion|sad|scd|s c d|cdb|b|a|bc|cd)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()

const clubs = db.prepare(`SELECT c.id, cr.ref, c.name FROM clubs c JOIN v_club_ref cr ON cr.club_id = c.id`).all()
const byId = new Map(clubs.map((c) => [c.id, c]))
// Categoría más alta (tier más bajo) de cada club en cada temporada, sin la Copa.
const tiers = db.prepare(`
  SELECT t.club_id, cs.season_id, MIN(co.tier) tier, GROUP_CONCAT(DISTINCT t.name) names
  FROM teams t JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN competitions co ON co.id = cs.competition_id
  WHERE co.code != 'COPA_ESPANA' GROUP BY 1, 2`).all()
const tierOf = new Map(tiers.map((r) => [`${r.club_id}:${r.season_id}`, r.tier]))
const namesOf = new Map()
for (const r of tiers) namesOf.set(r.club_id, new Set([...(namesOf.get(r.club_id) ?? []), ...r.names.split(','), byId.get(r.club_id)?.name ?? '']))

// Jugadores compartidos por pares de clubes en la misma temporada.
const shared = db.prepare(`
  WITH pc AS (SELECT DISTINCT s.player_id, t.club_id, cs.season_id FROM player_game_stats s
    JOIN teams t ON t.id = s.team_id JOIN competition_seasons cs ON cs.id = t.competition_season_id
    JOIN competitions co ON co.id = cs.competition_id WHERE co.code != 'COPA_ESPANA')
  SELECT a.club_id child, b.club_id parent, a.season_id season, COUNT(*) n FROM pc a
  JOIN pc b ON a.player_id = b.player_id AND a.season_id = b.season_id AND a.club_id != b.club_id
  GROUP BY 1, 2, 3`).all()

const cand = new Map()
const add = (child, parent, why, n = 0) => {
  const k = `${child}>${parent}`
  const c = cand.get(k) ?? { child, parent, shared: 0, seasons: 0, name: false }
  if (why === 'name') c.name = true
  else (c.shared += n, c.seasons++)
  cand.set(k, c)
}
for (const r of shared) {
  const tc = tierOf.get(`${r.child}:${r.season}`), tp = tierOf.get(`${r.parent}:${r.season}`)
  if (tc != null && tp != null && tp < tc && r.n >= 2) add(r.child, r.parent, 'shared', r.n)
}
// Mismo nombre normalizado y categoría distinta (p. ej. "Movistar Estudiantes" en Primera y en Segunda).
const best = (id) => Math.min(...tiers.filter((t) => t.club_id === id).map((t) => t.tier))
for (const a of clubs) for (const b of clubs) {
  if (a.id === b.id) continue
  const na = [...(namesOf.get(a.id) ?? [])].map(norm), nb = [...(namesOf.get(b.id) ?? [])].map(norm)
  const match = na.some((x) => x.length > 4 && nb.some((y) => y === x || (y.length > 5 && x.startsWith(y + ' ')) || (x.length > 5 && y.startsWith(x))))
  if (match && best(b.id) < best(a.id)) add(a.id, b.id, 'name')
}
// Por cada filial, el primer equipo con más evidencia (nombre primero, luego jugadores compartidos).
const out = {}
for (const c of [...cand.values()].sort((x, y) => Number(y.name) - Number(x.name) || y.shared - x.shared)) {
  if (!c.name && c.shared < 2) continue
  const ch = byId.get(c.child), pa = byId.get(c.parent)
  if (!ch || !pa || out[ch.ref]) continue
  out[ch.ref] = { name: ch.name, parent: pa.ref, parent_name: pa.name, shared: c.shared, seasons: c.seasons, by_name: c.name }
}
fs.writeFileSync(path.join(dir, 'filiales-candidatos.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`${Object.keys(out).length} candidatos → tools/media/filiales-candidatos.json`)
