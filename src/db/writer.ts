/**
 * Escritura idempotente de datos normalizados en SQLite.
 * Toda entidad se localiza por su id externo (tabla external_ids), de modo que
 * volver a ejecutar el scraper actualiza en lugar de duplicar.
 */
import type { DB } from './database'
import type { NHonour } from '../scraper/wiki/honours'
import type {
  NBoxscore,
  NCoach,
  NEdition,
  NGame,
  NPlayer,
  NRosterEntry,
  NRound,
  NStatLine,
  NTeam,
  SourceRef,
  NClubInfo,
  NClubRecord,
  NPlayerGameRow,
  NPlayerProfile,
  NStint
} from '../scraper/types'

type EntityType = 'competition_season' | 'club' | 'team' | 'player' | 'coach' | 'game' | 'round'

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

/** Nombre tal y como se publica, sin puntuación suelta en los extremos (la FEB tiene
" ,alberto Vicente…") y con la primera letra en mayúscula. */
export function cleanName(name: string): string {
  const s = name.replace(/^[^\p{L}]+|[^\p{L}.)]+$/gu, '').replace(/\s+/g, ' ')
  return s ? s[0].toLocaleUpperCase('es') + s.slice(1) : name.trim()
}

export class Writer {
  constructor(private readonly db: DB) {}

  // ───────── external ids ─────────
  findId(type: EntityType, ref: SourceRef): number | undefined {
    const row = this.db
      .prepare('SELECT entity_id FROM external_ids WHERE entity_type = ? AND source = ? AND external_id = ?')
      .get(type, ref.source, ref.id) as { entity_id: number } | undefined
    return row?.entity_id
  }

  link(type: EntityType, entityId: number, ref: SourceRef) {
    this.db
      .prepare(
        `INSERT INTO external_ids (entity_type, entity_id, source, external_id, url) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (entity_type, source, external_id)
         DO UPDATE SET entity_id = excluded.entity_id, url = COALESCE(excluded.url, external_ids.url)`
      )
      .run(type, entityId, ref.source, ref.id, ref.url ?? null)
  }

  externalIdOf(type: EntityType, entityId: number, source: string): string | undefined {
    const row = this.db
      .prepare('SELECT external_id FROM external_ids WHERE entity_type = ? AND entity_id = ? AND source = ?')
      .get(type, entityId, source) as { external_id: string } | undefined
    return row?.external_id
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // ───────── temporadas / ediciones ─────────
  upsertEdition(e: NEdition): number {
    const comp = this.db.prepare('SELECT id FROM competitions WHERE code = ?').get(e.competition) as
      | { id: number }
      | undefined
    if (!comp) throw new Error(`Competición desconocida: ${e.competition}`)
    const label = `${e.startYear}-${String(e.startYear + 1).slice(-2)}`
    this.db
      .prepare('INSERT INTO seasons (start_year, end_year, label) VALUES (?, ?, ?) ON CONFLICT (start_year) DO NOTHING')
      .run(e.startYear, e.startYear + 1, label)
    const season = this.db.prepare('SELECT id FROM seasons WHERE start_year = ?').get(e.startYear) as { id: number }

    this.db
      .prepare(
        `INSERT INTO competition_seasons (competition_id, season_id, name, is_current) VALUES (?, ?, ?, ?)
         ON CONFLICT (competition_id, season_id)
         DO UPDATE SET name = COALESCE(excluded.name, name), is_current = MAX(is_current, excluded.is_current)`
      )
      .run(comp.id, season.id, e.name ?? null, e.isCurrent ? 1 : 0)
    const cs = this.db
      .prepare('SELECT id FROM competition_seasons WHERE competition_id = ? AND season_id = ?')
      .get(comp.id, season.id) as { id: number }
    if (e.isCurrent) {
      this.db
        .prepare('UPDATE competition_seasons SET is_current = (id = ?) WHERE competition_id = ?')
        .run(cs.id, comp.id)
    }
    this.link('competition_season', cs.id, e.ref)
    return cs.id
  }

  touchEdition(csId: number) {
    this.db.prepare('UPDATE competition_seasons SET last_synced_at = ? WHERE id = ?').run(nowIso(), csId)
  }

  // ───────── clubes / equipos ─────────
  /**
   * Une dos registros del mismo club (p. ej. la misma entidad FEB en dos temporadas, que la
   * FEB publica con ids distintos). Los equipos, ids externos y datos pasan a `into`.
   */
  mergeClub(from: number, into: number) {
    if (from === into) return
    const db = this.db
    db.prepare('UPDATE teams SET club_id = ? WHERE club_id = ?').run(into, from)
    db.prepare("UPDATE external_ids SET entity_id = ? WHERE entity_type = 'club' AND entity_id = ?").run(into, from)
    db.prepare('UPDATE player_season_lines SET club_id = ? WHERE club_id = ?').run(into, from)
    db.prepare('UPDATE honours SET champion_club_id = ? WHERE champion_club_id = ?').run(into, from)
    db.prepare('UPDATE honours SET runner_up_club_id = ? WHERE runner_up_club_id = ?').run(into, from)
    db.prepare('UPDATE OR IGNORE club_records SET club_id = ? WHERE club_id = ?').run(into, from)
    // Datos que solo tuviera el registro antiguo.
    db.prepare(
      `UPDATE clubs SET
         founded_year = COALESCE(founded_year, (SELECT founded_year FROM clubs WHERE id = @from)),
         arena = COALESCE(arena, (SELECT arena FROM clubs WHERE id = @from)),
         arena_address = COALESCE(arena_address, (SELECT arena_address FROM clubs WHERE id = @from)),
         website = COALESCE(website, (SELECT website FROM clubs WHERE id = @from)),
         president = COALESCE(president, (SELECT president FROM clubs WHERE id = @from))
       WHERE id = @into`
    ).run({ from, into })
    db.prepare('DELETE FROM club_records WHERE club_id = ?').run(from)
    db.prepare('DELETE FROM clubs WHERE id = ?').run(from)
  }

  upsertTeam(csId: number, t: NTeam, opts: { updateClubName?: boolean } = {}): number {
    let clubId = this.findId('club', t.clubRef)
    if (clubId == null) {
      clubId = Number(
        this.db
          .prepare('INSERT INTO clubs (name, short_name, abbreviation, logo_url, primary_color) VALUES (?, ?, ?, ?, ?)')
          .run(t.name, t.shortName ?? null, t.abbreviation ?? null, t.logoUrl ?? null, t.primaryColor ?? null).lastInsertRowid
      )
      this.link('club', clubId, t.clubRef)
    } else if (opts.updateClubName) {
      this.db
        .prepare('UPDATE clubs SET name = ?, short_name = ?, abbreviation = ?, logo_url = COALESCE(?, logo_url), primary_color = COALESCE(?, primary_color), updated_at = ? WHERE id = ?')
        .run(t.name, t.shortName ?? null, t.abbreviation ?? null, t.logoUrl ?? null, t.primaryColor ?? null, nowIso(), clubId)
    }
    if (t.clubRef.url) this.link('club', clubId, t.clubRef)

    this.db
      .prepare(
        `INSERT INTO teams (club_id, competition_season_id, name, short_name, abbreviation, primary_color, text_color, logo_url, source_slug, group_name)
         VALUES (@club, @cs, @name, @short, @abbr, @color, @text, @logo, @slug, @group)
         ON CONFLICT (club_id, competition_season_id) DO UPDATE SET
           name = excluded.name,
           short_name = COALESCE(excluded.short_name, short_name),
           abbreviation = COALESCE(excluded.abbreviation, abbreviation),
           primary_color = COALESCE(excluded.primary_color, primary_color),
           text_color = COALESCE(excluded.text_color, text_color),
           logo_url = COALESCE(excluded.logo_url, logo_url),
           source_slug = COALESCE(excluded.source_slug, source_slug),
           group_name = COALESCE(excluded.group_name, group_name)`
      )
      .run({
        club: clubId,
        cs: csId,
        name: t.name,
        short: t.shortName ?? null,
        abbr: t.abbreviation ?? null,
        color: t.primaryColor ?? null,
        text: t.textColor ?? null,
        logo: t.logoUrl ?? null,
        slug: t.slug ?? null,
        group: t.group ?? null
      })
    const team = this.db
      .prepare('SELECT id FROM teams WHERE club_id = ? AND competition_season_id = ?')
      .get(clubId, csId) as { id: number }
    this.link('team', team.id, t.ref)
    return team.id
  }

  // ───────── jugadores / entrenadores ─────────
  upsertPlayer(p: NPlayer, opts: { bio?: boolean; fillOnly?: boolean } = {}): number {
    const values = {
      first: p.firstName ?? null,
      last: p.lastName ?? null,
      full: cleanName(p.fullName),
      known: p.knownAs ? cleanName(p.knownAs) : null,
      bdate: p.birthDate ?? null,
      bplace: p.birthPlace ?? null,
      bcountry: p.birthCountry ?? null,
      nat: p.nationality ?? null,
      height: p.heightCm ?? null,
      pos: p.position ?? null,
      poscode: p.positionCode ?? null,
      photo: p.photoUrl ?? null,
      nobg: p.photoNobgUrl ?? null,
      body: p.bodyPhotoUrl ?? null,
      bio: opts.bio ? nowIso() : null,
      now: nowIso()
    }
    let id = this.findId('player', p.ref) ?? this.matchPlayer(p)
    if (id != null && this.findId('player', p.ref) == null) this.link('player', id, p.ref)
    if (id == null) {
      id = Number(
        this.db
          .prepare(
            `INSERT INTO players (first_name, last_name, full_name, known_as, birth_date, birth_place, birth_country,
               nationality, height_cm, position, position_code, photo_url, photo_nobg_url, body_photo_url, bio_synced_at)
             VALUES (@first, @last, @full, @known, @bdate, @bplace, @bcountry, @nat, @height, @pos, @poscode, @photo, @nobg, @body, @bio)`
          )
          .run(values).lastInsertRowid
      )
      this.link('player', id, p.ref)
      return id
    }
    // Una fuente secundaria (p. ej. Euroleague, sin tildes) solo rellena lo que falte.
    if (opts.fillOnly) {
      this.db
        .prepare(
          `UPDATE players SET first_name = COALESCE(first_name, @first), last_name = COALESCE(last_name, @last),
             birth_date = COALESCE(birth_date, @bdate), birth_country = COALESCE(birth_country, @bcountry),
             nationality = COALESCE(nationality, @nat), height_cm = COALESCE(height_cm, @height),
             position = COALESCE(position, @pos), position_code = COALESCE(position_code, @poscode),
             photo_url = COALESCE(photo_url, @photo), updated_at = @now WHERE id = @id`
        )
        .run({ ...values, id })
      return id
    }
    // Nunca pisamos un dato conocido con un vacío.
    this.db
      .prepare(
        `UPDATE players SET
           first_name = COALESCE(@first, first_name), last_name = COALESCE(@last, last_name),
           full_name = COALESCE(@full, full_name), known_as = @known,
           birth_date = COALESCE(@bdate, birth_date), birth_place = COALESCE(@bplace, birth_place),
           birth_country = COALESCE(@bcountry, birth_country), nationality = COALESCE(@nat, nationality),
           height_cm = COALESCE(@height, height_cm), position = COALESCE(@pos, position),
           position_code = COALESCE(@poscode, position_code), photo_url = COALESCE(@photo, photo_url),
           photo_nobg_url = COALESCE(@nobg, photo_nobg_url), body_photo_url = COALESCE(@body, body_photo_url),
           bio_synced_at = COALESCE(@bio, bio_synced_at), updated_at = @now
         WHERE id = @id`
      )
      .run({ ...values, id })
    if (p.ref.url) this.link('player', id, p.ref)
    return id
  }

  /**
   * Jugador ya conocido desde otra fuente: misma fecha de nacimiento y al menos un
   * apellido en común (sin tildes). Así se une la carrera ACB y FEB de una persona.
   */
  private matchPlayer(p: NPlayer): number | undefined {
    if (!p.birthDate) return undefined
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length > 2)
    const mine = new Set(norm(p.lastName ?? p.fullName))
    const candidates = this.db
      .prepare(
        `SELECT p.id, p.full_name, p.known_as FROM players p
         WHERE p.birth_date = ? AND NOT EXISTS (
           SELECT 1 FROM external_ids x WHERE x.entity_type = 'player' AND x.entity_id = p.id AND x.source = ?)`
      )
      .all(p.birthDate, p.ref.source) as { id: number; full_name: string; known_as: string | null }[]
    const hit = candidates.filter((c) => norm(`${c.full_name} ${c.known_as ?? ''}`).some((w) => mine.has(w)))
    return hit.length === 1 ? hit[0].id : undefined
  }

  /** Une dos fichas de la misma persona (p. ej. la de acb.com y la de la FEB): todo pasa a `into`. */
  mergePlayer(from: number, into: number) {
    if (from === into) return
    const db = this.db
    db.prepare('UPDATE OR IGNORE roster_entries SET player_id = ? WHERE player_id = ?').run(into, from)
    db.prepare('UPDATE OR IGNORE player_game_stats SET player_id = ? WHERE player_id = ?').run(into, from)
    db.prepare('UPDATE OR IGNORE player_stints SET player_id = ? WHERE player_id = ?').run(into, from)
    db.prepare('UPDATE OR IGNORE player_season_lines SET player_id = ? WHERE player_id = ?').run(into, from)
    db.prepare('UPDATE OR IGNORE player_season_fetches SET player_id = ? WHERE player_id = ?').run(into, from)
    db.prepare('UPDATE scouting_reports SET player_id = ? WHERE player_id = ?').run(into, from)
    db.prepare("UPDATE external_ids SET entity_id = ? WHERE entity_type = 'player' AND entity_id = ?").run(into, from)
    const cols = ['first_name', 'last_name', 'known_as', 'birth_date', 'birth_place', 'birth_country', 'nationality',
      'height_cm', 'weight_kg', 'position', 'position_code', 'photo_url', 'photo_nobg_url']
    const existing = new Set((db.prepare('PRAGMA table_info(players)').all() as { name: string }[]).map((c) => c.name))
    const fill = cols.filter((c) => existing.has(c)).map((c) => `${c} = COALESCE(${c}, (SELECT ${c} FROM players WHERE id = @from))`)
    db.prepare(`UPDATE players SET ${fill.join(', ')} WHERE id = @into`).run({ from, into })
    // Lo que no se pudo mover por duplicado (mismo partido o misma plantilla) se descarta.
    for (const t of ['roster_entries', 'player_game_stats', 'player_stints', 'player_season_lines', 'player_season_fetches']) {
      db.prepare(`DELETE FROM ${t} WHERE player_id = ?`).run(from)
    }
    db.prepare('DELETE FROM players WHERE id = ?').run(from)
  }

  /**
   * Une las fichas de una misma persona creadas desde fuentes distintas: la FEB crea el jugador
   * sin fecha de nacimiento (llega después con su ficha), así que al crearlo no se pudo emparejar.
   * Criterio: misma fecha de nacimiento, algún apellido en común, fuentes distintas y un único
   * candidato. Se conserva la ficha de acb.com (su ref es la estable).
   */
  dedupePlayers(): number {
    const words = (s: string) =>
      new Set(
        s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length > 2)
      )
    const rows = this.db
      .prepare(
        `SELECT p.id, p.full_name AS name, p.last_name AS last, p.birth_date AS birth,
                (SELECT GROUP_CONCAT(DISTINCT source) FROM external_ids x WHERE x.entity_type = 'player' AND x.entity_id = p.id) AS sources
         FROM players p WHERE p.birth_date IN (SELECT birth_date FROM players WHERE birth_date IS NOT NULL GROUP BY birth_date HAVING COUNT(*) > 1)`
      )
      .all() as { id: number; name: string; last: string | null; birth: string; sources: string | null }[]
    const byBirth = new Map<string, typeof rows>()
    for (const r of rows) byBirth.set(r.birth, [...(byBirth.get(r.birth) ?? []), r])
    let merged = 0
    this.transaction(() => {
      for (const group of byBirth.values()) {
        const alive = new Set(group.map((r) => r.id))
        for (const acb of group.filter((r) => r.sources === 'acb')) {
          const mine = words(acb.last ?? acb.name)
          const hits = group.filter((r) => r.sources === 'feb' && alive.has(r.id) && [...words(r.name)].some((w) => mine.has(w)))
          if (hits.length !== 1) continue
          this.mergePlayer(hits[0].id, acb.id)
          alive.delete(hits[0].id)
          merged++
        }
        // La propia FEB a veces da dos ids de persona al mismo jugador: una ficha solo FEB se une a
        // otra (de la fuente que sea) con el mismo nombre completo y nacimiento.
        const key = (r: (typeof group)[number]) => [...words(r.name)].sort().join(' ')
        for (const r of group.filter((x) => x.sources === 'feb')) {
          if (!alive.has(r.id)) continue
          const same = group.filter((o) => o.id !== r.id && alive.has(o.id) && key(o) === key(r))
          if (same.length !== 1) continue
          // Se conserva la ficha que ya tenga ACB; si no, la más antigua.
          const into = same[0].sources?.includes('acb') || same[0].id < r.id ? same[0] : r
          const from = into === r ? same[0] : r
          this.mergePlayer(from.id, into.id)
          alive.delete(from.id)
          merged++
        }
      }
    })
    return merged
  }

  savePlayerStints(playerId: number, source: string, stints: NStint[]) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM player_stints WHERE player_id = ? AND source = ?').run(playerId, source)
      const ins = this.db.prepare(
        `INSERT OR REPLACE INTO player_stints (player_id, source, season_start_year, competition, club_name, team_name, license, joined_on, left_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const s of stints) {
        ins.run(playerId, source, s.seasonStartYear, s.competition, s.club, s.team ?? null, s.license ?? null, s.joinedOn ?? null, s.leftOn ?? null)
      }
    })
  }

  upsertCoach(c: NCoach): number {
    let id = this.findId('coach', c.ref)
    if (id == null) {
      id = Number(
        this.db
          .prepare('INSERT INTO coaches (first_name, last_name, full_name, photo_url) VALUES (?, ?, ?, ?)')
          .run(c.firstName ?? null, c.lastName ?? null, c.fullName, c.photoUrl ?? null).lastInsertRowid
      )
      this.link('coach', id, c.ref)
    } else {
      this.db
        .prepare('UPDATE coaches SET full_name = ?, photo_url = COALESCE(?, photo_url) WHERE id = ?')
        .run(c.fullName, c.photoUrl ?? null, id)
    }
    return id
  }

  // ───────── plantillas ─────────
  upsertRosterEntry(teamId: number, playerId: number, e: Omit<NRosterEntry, 'player'>) {
    this.db
      .prepare(
        `INSERT INTO roster_entries (team_id, player_id, jersey_number, position, position_code, license_type, is_active, joined_on, last_seen_at)
         VALUES (@team, @player, @num, @pos, @code, @lic, @active, date('now'), @now)
         ON CONFLICT (team_id, player_id) DO UPDATE SET
           jersey_number = COALESCE(excluded.jersey_number, jersey_number),
           position = COALESCE(excluded.position, position),
           position_code = COALESCE(excluded.position_code, position_code),
           license_type = COALESCE(excluded.license_type, license_type),
           is_active = excluded.is_active,
           left_on = CASE WHEN excluded.is_active = 0 AND is_active = 1 THEN date('now')
                          WHEN excluded.is_active = 1 THEN NULL ELSE left_on END,
           last_seen_at = excluded.last_seen_at`
      )
      .run({
        team: teamId,
        player: playerId,
        num: e.jerseyNumber ?? null,
        pos: e.position ?? null,
        code: e.positionCode ?? null,
        lic: e.licenseType ?? null,
        active: e.isActive ? 1 : 0,
        now: nowIso()
      })
  }

  /** Jugador visto en un boxscore: garantiza que figura en la plantilla sin tocar su estado. */
  ensureRosterEntry(teamId: number, playerId: number, jerseyNumber?: string) {
    this.db
      .prepare(
        `INSERT INTO roster_entries (team_id, player_id, jersey_number) VALUES (?, ?, ?)
         ON CONFLICT (team_id, player_id) DO NOTHING`
      )
      .run(teamId, playerId, jerseyNumber ?? null)
  }

  /** Marca como baja a quien estaba activo y ya no aparece en la plantilla oficial. */
  deactivateMissing(teamId: number, seenPlayerIds: number[]) {
    if (seenPlayerIds.length === 0) return 0
    const placeholders = seenPlayerIds.map(() => '?').join(',')
    return this.db
      .prepare(
        `UPDATE roster_entries SET is_active = 0, left_on = date('now')
         WHERE team_id = ? AND is_active = 1 AND player_id NOT IN (${placeholders})`
      )
      .run(teamId, ...seenPlayerIds).changes
  }

  setStaff(teamId: number, staff: { coachId: number; role: NCoach['role'] }[]) {
    this.db.prepare('DELETE FROM team_staff WHERE team_id = ?').run(teamId)
    const ins = this.db.prepare('INSERT OR IGNORE INTO team_staff (team_id, coach_id, role) VALUES (?, ?, ?)')
    for (const s of staff) ins.run(teamId, s.coachId, s.role)
  }

  // ───────── calendario ─────────
  upsertRound(csId: number, r: NRound): number {
    this.db
      .prepare(
        `INSERT INTO rounds (competition_season_id, phase, number, name) VALUES (?, ?, ?, ?)
         ON CONFLICT (competition_season_id, phase, number) DO UPDATE SET name = COALESCE(excluded.name, name)`
      )
      .run(csId, r.phase, r.number, r.name ?? null)
    const row = this.db
      .prepare('SELECT id FROM rounds WHERE competition_season_id = ? AND phase = ? AND number = ?')
      .get(csId, r.phase, r.number) as { id: number }
    if (r.ref) this.link('round', row.id, r.ref)
    return row.id
  }

  /**
   * Playoffs de acb.com: solo llegan como "Playoff" (o "Playoff · ronda N"). Se deducen las rondas del
   * cuadro: cada emparejamiento es una serie, se ordenan por fecha de inicio y se reparten de mayor a
   * menor (con 7 series: 4 cuartos, 2 semifinales y la final). Cada partido queda como
   * "Cuartos de final · Partido 2".
   */
  labelPlayoffSeries(csId: number) {
    const games = this.db
      .prepare(
        `SELECT g.id, g.home_team_id AS h, g.away_team_id AS a, g.scheduled_at AS at FROM games g
         JOIN rounds r ON r.id = g.round_id
         WHERE g.competition_season_id = ? AND r.phase = 'playoff' AND r.name LIKE 'Playoff%'
         ORDER BY g.scheduled_at, g.id`
      )
      .all(csId) as { id: number; h: number; a: number; at: string | null }[]
    if (!games.length) return
    const series = new Map<string, typeof games>()
    for (const g of games) {
      const key = [g.h, g.a].sort((x, y) => x - y).join('-')
      series.set(key, [...(series.get(key) ?? []), g])
    }
    const ordered = [...series.values()]
    const names = ['Final', 'Semifinales', 'Cuartos de final', 'Octavos de final']
    // Tamaños por ronda (de la última hacia atrás): 1, 2, 4, 8...
    const stages: { name: string; order: number; size: number }[] = []
    for (let i = 0, left = ordered.length; left > 0 && i < names.length; i++) {
      const size = Math.min(2 ** i, left)
      stages.unshift({ name: names[i], order: 5 - i, size })
      left -= size
    }
    if (stages.reduce((a, s) => a + s.size, 0) !== ordered.length) return // cuadro no reconocible: se deja como está
    let idx = 0
    this.transaction(() => {
      for (const stage of stages) {
        for (const s of ordered.slice(idx, idx + stage.size)) {
          s.forEach((g, n) => {
            const round = this.upsertRound(csId, { phase: 'playoff', number: stage.order * 100 + n + 1, name: `${stage.name} · Partido ${n + 1}` })
            this.db.prepare('UPDATE games SET round_id = ? WHERE id = ?').run(round, g.id)
          })
        }
        idx += stage.size
      }
      this.db
        .prepare('DELETE FROM rounds WHERE competition_season_id = ? AND NOT EXISTS (SELECT 1 FROM games g WHERE g.round_id = rounds.id)')
        .run(csId)
      this.refreshRoundDates(csId)
    })
  }

  refreshRoundDates(csId: number) {
    this.db
      .prepare(
        `UPDATE rounds SET
           start_date = (SELECT substr(MIN(scheduled_at), 1, 10) FROM games WHERE round_id = rounds.id),
           end_date   = (SELECT substr(MAX(scheduled_at), 1, 10) FROM games WHERE round_id = rounds.id)
         WHERE competition_season_id = ?`
      )
      .run(csId)
  }

  upsertGame(
    csId: number,
    g: Pick<NGame, 'ref' | 'round' | 'scheduledAt' | 'status' | 'homeScore' | 'awayScore'>,
    homeTeamId: number,
    awayTeamId: number
  ): number {
    const roundId = g.round ? this.upsertRound(csId, g.round) : null
    const values = {
      cs: csId,
      round: roundId,
      home: homeTeamId,
      away: awayTeamId,
      at: g.scheduledAt ?? null,
      status: g.status,
      hs: g.homeScore ?? null,
      as: g.awayScore ?? null,
      now: nowIso()
    }
    const id = this.findId('game', g.ref)
    if (id == null) {
      const newId = Number(
        this.db
          .prepare(
            `INSERT INTO games (competition_season_id, round_id, home_team_id, away_team_id, scheduled_at, status, home_score, away_score)
             VALUES (@cs, @round, @home, @away, @at, @status, @hs, @as)`
          )
          .run(values).lastInsertRowid
      )
      this.link('game', newId, g.ref)
      return newId
    }
    this.db
      .prepare(
        `UPDATE games SET round_id = COALESCE(@round, round_id), home_team_id = @home, away_team_id = @away,
           scheduled_at = COALESCE(@at, scheduled_at),
           -- Un calendario sin resultado no borra el marcador que ya sacamos de la ficha del partido.
           status = CASE WHEN @status <> 'finished' AND @hs IS NULL AND status = 'finished' THEN status ELSE @status END,
           home_score = CASE WHEN @hs IS NULL AND status = 'finished' THEN home_score ELSE @hs END,
           away_score = CASE WHEN @as IS NULL AND status = 'finished' THEN away_score ELSE @as END,
           updated_at = @now
         WHERE id = @id`
      )
      .run({ ...values, id })
    return id
  }

  // ───────── boxscores ─────────
  saveBoxscore(csId: number, box: NBoxscore, extra: Pick<NGame, 'round'> = {}): number {
    return this.transaction(() => {
      const homeId = this.upsertTeam(csId, box.homeTeam)
      const awayId = this.upsertTeam(csId, box.awayTeam)
      const gameId = this.upsertGame(
        csId,
        {
          ref: box.gameRef,
          round: extra.round,
          scheduledAt: box.scheduledAt,
          status: box.status,
          homeScore: box.homeScore,
          awayScore: box.awayScore
        },
        homeId,
        awayId
      )

      const periodsPlayed = box.periodScores.length || null
      this.db
        .prepare(
          `UPDATE games SET arena = COALESCE(?, arena), attendance = COALESCE(?, attendance),
             referees = ?, periods_played = COALESCE(?, periods_played), boxscore_synced_at = ? WHERE id = ?`
        )
        .run(
          box.arena ?? null,
          box.attendance ?? null,
          box.referees.length ? JSON.stringify(box.referees) : null,
          periodsPlayed,
          box.teams.length ? nowIso() : null,
          gameId
        )

      this.db.prepare('DELETE FROM game_period_scores WHERE game_id = ?').run(gameId)
      const insScore = this.db.prepare(
        'INSERT INTO game_period_scores (game_id, period, home_points, away_points) VALUES (?, ?, ?, ?)'
      )
      for (const q of box.periodScores) if (q.period >= 1) insScore.run(gameId, q.period, q.home, q.away)

      if (box.teams.length === 0) return gameId

      this.db.prepare('DELETE FROM player_game_stats WHERE game_id = ?').run(gameId)
      this.db.prepare('DELETE FROM team_game_stats WHERE game_id = ?').run(gameId)
      const insPlayer = this.db.prepare(
        `INSERT OR REPLACE INTO player_game_stats (game_id, period, player_id, team_id, jersey_number, is_starter, seconds, points,
           fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, blk_against, dunks, pf, fouls_drawn, plus_minus, pir)
         VALUES (@game, @period, @player, @team, @num, @starter, @seconds, @points,
           @fg2m, @fg2a, @fg3m, @fg3a, @ftm, @fta, @oreb, @dreb, @reb, @ast, @stl, @tov, @blk, @blkAgainst, @dunks, @pf, @foulsDrawn, @plusMinus, @pir)`
      )
      const insTeam = this.db.prepare(
        `INSERT OR REPLACE INTO team_game_stats (game_id, period, team_id, is_home, points,
           fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, blk_against, dunks, pf, fouls_drawn, pir,
           team_oreb, team_dreb, team_tov, head_coach)
         VALUES (@game, @period, @team, @isHome, @points,
           @fg2m, @fg2a, @fg3m, @fg3a, @ftm, @fta, @oreb, @dreb, @reb, @ast, @stl, @tov, @blk, @blkAgainst, @dunks, @pf, @foulsDrawn, @pir,
           @teamOreb, @teamDreb, @teamTov, @coach)`
      )
      const stat = (s: NStatLine) => ({ ...s, plusMinus: s.plusMinus ?? null, pir: s.pir ?? null })

      for (const tb of box.teams) {
        const teamId = this.upsertTeam(csId, tb.team)
        const playerIds = new Map<string, number>()
        for (const period of tb.periods) {
          for (const line of period.players) {
            let playerId = playerIds.get(line.player.ref.id)
            if (playerId == null) {
              playerId = this.upsertPlayer(line.player, { fillOnly: line.player.ref.source !== 'acb' && line.player.ref.source !== 'feb' })
              playerIds.set(line.player.ref.id, playerId)
              this.ensureRosterEntry(teamId, playerId, line.jerseyNumber)
            }
            insPlayer.run({
              ...stat(line),
              game: gameId,
              period: period.period,
              player: playerId,
              team: teamId,
              num: line.jerseyNumber ?? null,
              starter: line.isStarter ? 1 : 0
            })
          }
          const { seconds: _s, plusMinus: _pm, ...total } = stat(period.total)
          insTeam.run({
            ...total,
            game: gameId,
            period: period.period,
            team: teamId,
            isHome: tb.isHome ? 1 : 0,
            teamOreb: period.teamOnly.oreb,
            teamDreb: period.teamOnly.dreb,
            teamTov: period.teamOnly.tov,
            coach: tb.headCoach ?? null
          })
        }
      }
      return gameId
    })
  }

  // ───────── ficha de club ─────────
  /** Club por id externo; lo crea si no existe (clubes históricos que ya no están en la liga). */
  ensureClub(ref: SourceRef, name: string, extra: { abbreviation?: string; logoUrl?: string } = {}): number {
    let id = this.findId('club', ref)
    if (id == null) {
      id = Number(
        this.db
          .prepare('INSERT INTO clubs (name, abbreviation, logo_url) VALUES (?, ?, ?)')
          .run(name, extra.abbreviation ?? null, extra.logoUrl ?? null).lastInsertRowid
      )
      this.link('club', id, ref)
    } else if (extra.logoUrl) {
      this.db.prepare('UPDATE clubs SET logo_url = COALESCE(logo_url, ?) WHERE id = ?').run(extra.logoUrl, id)
    }
    return id
  }

  updateClubInfo(info: NClubInfo) {
    const id = this.findId('club', info.clubRef)
    if (id == null) return
    this.db
      .prepare(
        `UPDATE clubs SET founded_year = COALESCE(@founded, founded_year), arena = COALESCE(@arena, arena),
           arena_address = COALESCE(@address, arena_address), arena_capacity = COALESCE(@capacity, arena_capacity),
           arena_photo_url = COALESCE(@photo, arena_photo_url), website = COALESCE(@web, website),
           president = COALESCE(@president, president), logo_url = COALESCE(@logo, logo_url),
           primary_color = COALESCE(@color, primary_color), socials = COALESCE(@socials, socials), updated_at = @now
         WHERE id = @id`
      )
      .run({
        id,
        founded: info.foundedYear ?? null,
        arena: info.arena ?? null,
        address: info.arenaAddress ?? null,
        capacity: info.arenaCapacity ?? null,
        photo: info.arenaPhotoUrl ?? null,
        web: info.website ?? null,
        president: info.president ?? null,
        logo: info.logoUrl ?? null,
        color: info.primaryColor ?? null,
        socials: Object.keys(info.socials).length ? JSON.stringify(info.socials) : null,
        now: nowIso()
      })
  }

  setClubHistory(clubId: number, text: string, url?: string) {
    this.db.prepare('UPDATE clubs SET history = ?, history_url = ? WHERE id = ?').run(text, url ?? null, clubId)
  }

  // ───────── carrera del jugador ─────────
  savePlayerProfileExtras(playerId: number, profile: NPlayerProfile) {
    this.db
      .prepare('UPDATE players SET career = ?, source_editions = ?, socials = ? WHERE id = ?')
      .run(
        JSON.stringify(profile.career),
        JSON.stringify(profile.editions),
        Object.keys(profile.socials).length ? JSON.stringify(profile.socials) : null,
        playerId
      )
  }

  /** Agrega los partidos de una temporada por club y guarda la línea de trayectoria. */
  savePlayerSeason(playerId: number, seasonStartYear: number, editionId: string, rows: NPlayerGameRow[]) {
    this.transaction(() => {
      this.db
        .prepare('DELETE FROM player_season_lines WHERE player_id = ? AND competition_code = ? AND season_start_year = ?')
        .run(playerId, 'ACB', seasonStartYear)
      const byClub = new Map<string, NPlayerGameRow[]>()
      for (const r of rows) byClub.set(r.team.clubId, [...(byClub.get(r.team.clubId) ?? []), r])
      const ins = this.db.prepare(
        `INSERT INTO player_season_lines (player_id, competition_code, season_start_year, club_source_id, club_id,
           team_name, team_abbr, games, playoff_games, wins, seconds, points, fg2m, fg2a, fg3m, fg3a, ftm, fta,
           oreb, dreb, reb, ast, stl, tov, blk, dunks, pf, fouls_drawn, pir, plus_minus)
         VALUES (@player, 'ACB', @season, @club, @clubId, @name, @abbr, @games, @po, @wins, @seconds, @points,
           @fg2m, @fg2a, @fg3m, @fg3a, @ftm, @fta, @oreb, @dreb, @reb, @ast, @stl, @tov, @blk, @dunks, @pf, @fd, @pir, @pm)`
      )
      for (const [club, games] of byClub) {
        const sum = (k: keyof NPlayerGameRow) => games.reduce((a, g) => a + (Number(g[k]) || 0), 0)
        const first = games[0].team
        ins.run({
          player: playerId,
          season: seasonStartYear,
          club,
          clubId: this.ensureClub({ source: 'acb', id: club }, first.name, { abbreviation: first.abbreviation }),
          name: first.name,
          abbr: first.abbreviation ?? null,
          games: games.length,
          po: games.filter((g) => g.roundType && g.roundType !== 'LR').length,
          wins: games.filter((g) => g.won).length,
          seconds: sum('seconds'),
          points: sum('points'),
          fg2m: sum('fg2m'),
          fg2a: sum('fg2a'),
          fg3m: sum('fg3m'),
          fg3a: sum('fg3a'),
          ftm: sum('ftm'),
          fta: sum('fta'),
          oreb: sum('oreb'),
          dreb: sum('dreb'),
          reb: sum('reb'),
          ast: sum('ast'),
          stl: sum('stl'),
          tov: sum('tov'),
          blk: sum('blk'),
          dunks: sum('dunks'),
          pf: sum('pf'),
          fd: sum('foulsDrawn'),
          pir: sum('pir'),
          pm: sum('plusMinus')
        })
      }
      this.db
        .prepare(
          `INSERT INTO player_season_fetches (player_id, edition_source_id, fetched_at) VALUES (?, ?, ?)
           ON CONFLICT (player_id, edition_source_id) DO UPDATE SET fetched_at = excluded.fetched_at`
        )
        .run(playerId, editionId, nowIso())
    })
  }

  // ───────── historia ─────────
  saveClubRecords(scope: 'acb' | 'total', records: NClubRecord[]) {
    this.transaction(() => {
      for (const r of records) {
        const clubId = this.ensureClub(r.clubRef, r.name, { abbreviation: r.abbreviation, logoUrl: r.logoUrl })
        this.db
          .prepare(
            `INSERT INTO club_records (club_id, scope, position, seasons, games, wins, losses, ties, points_for,
               points_against, best_margin, worst_margin, first_places, second_places, third_places, fourth_places, updated_at)
             VALUES (@club, @scope, @position, @seasons, @games, @wins, @losses, @ties, @pf, @pa, @best, @worst,
               @p1, @p2, @p3, @p4, @now)
             ON CONFLICT (club_id, scope) DO UPDATE SET
               position = COALESCE(excluded.position, position), seasons = COALESCE(excluded.seasons, seasons),
               games = COALESCE(excluded.games, games), wins = COALESCE(excluded.wins, wins),
               losses = COALESCE(excluded.losses, losses), ties = COALESCE(excluded.ties, ties),
               points_for = COALESCE(excluded.points_for, points_for),
               points_against = COALESCE(excluded.points_against, points_against),
               best_margin = COALESCE(excluded.best_margin, best_margin),
               worst_margin = COALESCE(excluded.worst_margin, worst_margin),
               first_places = COALESCE(excluded.first_places, first_places),
               second_places = COALESCE(excluded.second_places, second_places),
               third_places = COALESCE(excluded.third_places, third_places),
               fourth_places = COALESCE(excluded.fourth_places, fourth_places),
               updated_at = excluded.updated_at`
          )
          .run({
            club: clubId,
            scope,
            position: r.position ?? null,
            seasons: r.seasons ?? null,
            games: r.games ?? null,
            wins: r.wins ?? null,
            losses: r.losses ?? null,
            ties: r.ties ?? null,
            pf: r.pointsFor ?? null,
            pa: r.pointsAgainst ?? null,
            best: r.bestMargin ?? null,
            worst: r.worstMargin ?? null,
            p1: r.firstPlaces ?? null,
            p2: r.secondPlaces ?? null,
            p3: r.thirdPlaces ?? null,
            p4: r.fourthPlaces ?? null,
            now: nowIso()
          })
      }
    })
  }

  /** Sustituye el palmarés de una competición. `clubFor` traduce el artículo de Wikipedia a id acb. */
  saveHonours(competition: NHonour['competition'], honours: NHonour[], clubFor: (article?: string) => string | undefined) {
    const clubId = (article?: string) => {
      const ext = clubFor(article)
      return ext ? (this.findId('club', { source: 'acb', id: ext }) ?? null) : null
    }
    this.transaction(() => {
      this.db.prepare('DELETE FROM honours WHERE competition = ?').run(competition)
      const ins = this.db.prepare(
        `INSERT INTO honours (competition, season_start_year, label, champion_name, champion_club_id,
           runner_up_name, runner_up_club_id, result, note, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'wikipedia')`
      )
      for (const h of honours) {
        ins.run(
          competition,
          h.seasonStartYear,
          h.label,
          h.championName,
          clubId(h.championArticle),
          h.runnerUpName ?? null,
          clubId(h.runnerUpArticle),
          h.result ?? null,
          h.note ?? null
        )
      }
    })
  }

  getMeta(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined)?.value
  }

  setMeta(key: string, value: string) {
    this.db
      .prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  }

  // ───────── registro de ejecuciones ─────────
  startRun(source: string, scope: string): number {
    return Number(
      this.db.prepare('INSERT INTO scrape_runs (source, scope) VALUES (?, ?)').run(source, scope).lastInsertRowid
    )
  }

  finishRun(
    runId: number,
    data: { csId?: number; status: 'ok' | 'partial' | 'error'; requests: number; summary: unknown; errors: unknown[] }
  ) {
    this.db
      .prepare(
        `UPDATE scrape_runs SET finished_at = ?, status = ?, requests = ?, summary = ?, errors = ?,
           competition_season_id = COALESCE(?, competition_season_id) WHERE id = ?`
      )
      .run(
        nowIso(),
        data.status,
        data.requests,
        JSON.stringify(data.summary),
        data.errors.length ? JSON.stringify(data.errors) : null,
        data.csId ?? null,
        runId
      )
  }
}
