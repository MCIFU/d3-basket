import type { DB } from './database'

/** Resultado de una comprobación: filas problemáticas (vacío = todo bien). */
export interface CheckResult {
  id: string
  title: string
  /** 'error' = dato incorrecto; 'aviso' = falta algo o conviene revisarlo. */
  level: 'error' | 'aviso'
  rows: Record<string, unknown>[]
}

const EDITION = `c.code || ' ' || s.label`
const EDITION_JOIN = `JOIN competition_seasons cs ON cs.id = g.competition_season_id
  JOIN competitions c ON c.id = cs.competition_id JOIN seasons s ON s.id = cs.season_id`

/**
 * Auditoría de integridad de toda la base de datos: marcadores contra estadísticas, partidos sin
 * estadística, calendarios incompletos, clubes y jugadores duplicados... `npm run scrape -- check`.
 */
export function runChecks(db: DB): CheckResult[] {
  const all = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[]
  const checks: (Omit<CheckResult, 'rows'> & { sql: string })[] = [
    {
      id: 'sin-boxscore',
      title: 'Partidos terminados sin estadística',
      level: 'aviso',
      sql: `SELECT ${EDITION} AS edicion, COUNT(*) AS partidos FROM games g ${EDITION_JOIN}
            WHERE g.status = 'finished' AND g.boxscore_synced_at IS NULL GROUP BY cs.id`
    },
    {
      id: 'fuente-incompleta',
      title: 'Estadística incompleta en la fuente (el total publicado no suma el marcador)',
      level: 'aviso',
      sql: `SELECT ${EDITION} AS edicion, COUNT(*) AS partidos FROM games g ${EDITION_JOIN}
            JOIN team_game_stats h ON h.game_id = g.id AND h.period = 0 AND h.team_id = g.home_team_id
            JOIN team_game_stats a ON a.game_id = g.id AND a.period = 0 AND a.team_id = g.away_team_id
            WHERE g.status = 'finished' AND (h.points <> g.home_score OR a.points <> g.away_score) GROUP BY cs.id`
    },
    {
      id: 'jugadores-total',
      title: 'Suma de los jugadores distinta del total del equipo en la estadística (fallo del parser)',
      level: 'error',
      sql: `SELECT ${EDITION} AS edicion, g.id AS partido, t.name AS equipo, p.pts AS jugadores, ts.points AS total
            FROM games g ${EDITION_JOIN}
            JOIN team_game_stats ts ON ts.game_id = g.id AND ts.period = 0
            JOIN (SELECT game_id, team_id, SUM(points) AS pts FROM player_game_stats WHERE period = 0 GROUP BY game_id, team_id) p
              ON p.game_id = g.id AND p.team_id = ts.team_id
            JOIN teams t ON t.id = ts.team_id
            WHERE p.pts <> ts.points`
    },
    {
      id: 'terminado-sin-marcador',
      title: 'Partidos terminados sin marcador',
      level: 'error',
      sql: `SELECT ${EDITION} AS edicion, g.id AS partido FROM games g ${EDITION_JOIN}
            WHERE g.status = 'finished' AND (g.home_score IS NULL OR g.away_score IS NULL)`
    },
    {
      id: 'pendientes-pasados',
      title: 'Partidos de la temporada en curso con fecha pasada y sin resultado (falta sincronizar)',
      level: 'aviso',
      sql: `SELECT ${EDITION} AS edicion, COUNT(*) AS partidos, MIN(g.scheduled_at) AS desde FROM games g ${EDITION_JOIN}
            WHERE cs.is_current = 1 AND g.status <> 'finished' AND g.scheduled_at < datetime('now', '-2 days')
            GROUP BY cs.id`
    },
    {
      id: 'calendario-descompensado',
      title: 'Temporadas cerradas con equipos con distinto número de partidos de liga regular en el calendario (mismo grupo)',
      level: 'error',
      sql: `WITH played AS (
              SELECT cs.id AS cs, t.group_name AS grupo, t.id AS team, COUNT(*) AS n
              FROM games g JOIN rounds r ON r.id = g.round_id AND r.phase = 'regular'
              JOIN teams t ON t.id IN (g.home_team_id, g.away_team_id)
              JOIN competition_seasons cs ON cs.id = g.competition_season_id
              WHERE cs.is_current = 0 GROUP BY cs.id, t.id)
            SELECT c.code || ' ' || s.label AS edicion, COALESCE(p.grupo, '') AS grupo, MIN(p.n) AS min, MAX(p.n) AS max
            FROM played p JOIN competition_seasons cs ON cs.id = p.cs JOIN competitions c ON c.id = cs.competition_id
            JOIN seasons s ON s.id = cs.season_id
            GROUP BY p.cs, p.grupo HAVING MAX(p.n) - MIN(p.n) > 1`
    },
    {
      // La FEB deja en el calendario partidos que no se llegaron a jugar (aplazados sin fecha,
      // incomparecencias) sin publicar resultado: no es un fallo de la descarga.
      id: 'sin-resultado-fuente',
      title: 'Partidos de temporadas cerradas sin resultado en la fuente (no disputados)',
      level: 'aviso',
      sql: `SELECT c.code || ' ' || s.label AS edicion, COALESCE(h.group_name, '') AS grupo, h.name AS local, a.name AS visitante,
                   substr(g.scheduled_at, 1, 10) AS fecha
            FROM games g JOIN rounds r ON r.id = g.round_id AND r.phase = 'regular'
            JOIN teams h ON h.id = g.home_team_id JOIN teams a ON a.id = g.away_team_id
            JOIN competition_seasons cs ON cs.id = g.competition_season_id AND cs.is_current = 0
            JOIN competitions c ON c.id = cs.competition_id JOIN seasons s ON s.id = cs.season_id
            WHERE g.status <> 'finished'`
    },
    {
      id: 'club-dos-equipos',
      title: 'Clubes con dos equipos en la misma temporada (filial mal unido)',
      level: 'error',
      sql: `SELECT cl.name AS club, s.label AS temporada, GROUP_CONCAT(t.name, ' | ') AS equipos
            FROM teams t JOIN clubs cl ON cl.id = t.club_id
            JOIN competition_seasons cs ON cs.id = t.competition_season_id JOIN seasons s ON s.id = cs.season_id
            JOIN competitions c ON c.id = cs.competition_id AND c.tier IS NOT NULL
            GROUP BY cl.id, cs.season_id HAVING COUNT(*) > 1`
    },
    {
      id: 'jugador-dos-equipos',
      title: 'Jugadores en dos equipos de la misma edición (normalmente traspasos a mitad de temporada)',
      level: 'aviso',
      sql: `SELECT p.full_name AS jugador, c.code || ' ' || s.label AS edicion, GROUP_CONCAT(t.name, ' | ') AS equipos
            FROM roster_entries r JOIN players p ON p.id = r.player_id JOIN teams t ON t.id = r.team_id
            JOIN competition_seasons cs ON cs.id = t.competition_season_id
            JOIN competitions c ON c.id = cs.competition_id JOIN seasons s ON s.id = cs.season_id
            WHERE r.is_active = 1 GROUP BY p.id, cs.id HAVING COUNT(*) > 1`
    },
    {
      id: 'jugador-duplicado',
      title: 'Posibles jugadores duplicados (mismo nombre y fecha de nacimiento)',
      level: 'aviso',
      sql: `SELECT full_name AS jugador, birth_date AS nacimiento, COUNT(*) AS fichas, GROUP_CONCAT(id) AS ids
            FROM players WHERE birth_date IS NOT NULL GROUP BY LOWER(full_name), birth_date HAVING COUNT(*) > 1`
    },
    {
      id: 'equipo-sin-plantilla',
      title: 'Equipos de la temporada en curso sin plantilla',
      level: 'aviso',
      sql: `SELECT c.code AS liga, t.name AS equipo FROM teams t
            JOIN competition_seasons cs ON cs.id = t.competition_season_id AND cs.is_current = 1
            JOIN competitions c ON c.id = cs.competition_id
            WHERE NOT EXISTS (SELECT 1 FROM roster_entries r WHERE r.team_id = t.id AND r.is_active = 1)`
    },
    {
      id: 'equipo-sin-escudo',
      title: 'Equipos sin escudo',
      level: 'aviso',
      sql: `SELECT c.code || ' ' || s.label AS edicion, t.name AS equipo FROM teams t JOIN clubs cl ON cl.id = t.club_id
            JOIN competition_seasons cs ON cs.id = t.competition_season_id
            JOIN competitions c ON c.id = cs.competition_id JOIN seasons s ON s.id = cs.season_id
            WHERE COALESCE(t.logo_url, cl.logo_url) IS NULL`
    },
    {
      id: 'huerfanos',
      title: 'Registros huérfanos (clubes sin equipos, rondas sin partidos)',
      level: 'aviso',
      sql: `SELECT 'club' AS tipo, COUNT(*) AS n FROM clubs c WHERE NOT EXISTS (SELECT 1 FROM teams t WHERE t.club_id = c.id)
              AND NOT EXISTS (SELECT 1 FROM honours h WHERE c.id IN (h.champion_club_id, h.runner_up_club_id))
              AND NOT EXISTS (SELECT 1 FROM club_records r WHERE r.club_id = c.id)
            UNION ALL
            SELECT 'ronda', COUNT(*) FROM rounds r WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.round_id = r.id)`
    }
  ]
  return checks.map(({ sql, ...c }) => ({ ...c, rows: all(sql).filter((r) => !('n' in r) || Number(r.n) > 0) }))
}
