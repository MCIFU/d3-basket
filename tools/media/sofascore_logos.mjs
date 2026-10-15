// Escudos de las ligas cuya fuente oficial no los publica (Champions League, ProA): se toman de
// Sofascore, emparejando cada equipo de la temporada en curso por nombre. Solo rellena equipos sin
// escudo; después tools/media/logos.py los descarga y normaliza en public/media/logos.
//
// Uso: NODE_USE_ENV_PROXY=1 node tools/media/sofascore_logos.mjs [data/d3basket.db]
import Database from 'better-sqlite3'

const TOURNAMENTS = { BCL: 9357, PROA: 1165 }
/** Nombres que no se parecen entre fuentes. */
const ALIASES = { 'Pallacanestro Reggiana': 'Reggio Emilia Reggiana', OrangeAcademy: 'Orange Academy Ulm' }
const db = new Database(process.argv[2] ?? 'data/d3basket.db')
const get = async (path) => (await fetch(`https://www.sofascore.com/api/v1${path}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json()
const words = (s) =>
  new Set(
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['basket', 'baskets', 'basketball', 'club'].includes(w))
  )
const score = (a, b) => {
  const A = words(a)
  const B = words(b)
  let n = 0
  for (const w of A) if (B.has(w)) n++
  return n / Math.max(1, Math.min(A.size, B.size))
}

for (const [code, id] of Object.entries(TOURNAMENTS)) {
  const season = (await get(`/unique-tournament/${id}/seasons`)).seasons[0].id
  const st = await get(`/unique-tournament/${id}/season/${season}/standings/total`)
  const ss = (st.standings ?? []).flatMap((s) => s.rows.map((r) => r.team))
  const teams = db
    .prepare(
      `SELECT t.id, t.name, t.short_name FROM teams t JOIN competition_seasons cs ON cs.id = t.competition_season_id
       JOIN competitions c ON c.id = cs.competition_id WHERE c.code = ? AND cs.is_current = 1 AND t.logo_url IS NULL`
    )
    .all(code)
  let done = 0
  for (const t of teams) {
    const best = ss.map((s) => ({ s, v: Math.max(score(ALIASES[t.name] ?? t.name, s.name), score(t.short_name ?? '', s.name)) })).sort((a, b) => b.v - a.v)[0]
    if (!best || best.v < 0.5) {
      console.log(`  ✗ ${code} ${t.name}: sin pareja`)
      continue
    }
    if (best.v < 1) console.log(`  ~ ${code} ${t.name} → ${best.s.name}`)
    db.prepare('UPDATE teams SET logo_url = ? WHERE id = ?').run(`https://img.sofascore.com/api/v1/team/${best.s.id}/image`, t.id)
    db.prepare('UPDATE clubs SET logo_url = COALESCE(logo_url, ?) WHERE id = (SELECT club_id FROM teams WHERE id = ?)').run(`https://img.sofascore.com/api/v1/team/${best.s.id}/image`, t.id)
    done++
  }
  console.log(`✔ ${code}: ${done}/${teams.length} escudos`)
}
