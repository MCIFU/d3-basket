/**
 * Migraciones del esquema SQLite de D3 Basket.
 * Cada migración se aplica una sola vez (tabla schema_migrations).
 * Nunca edites una migración ya publicada: añade una nueva.
 *
 * Convenciones:
 *  - Fechas en ISO-8601 (TEXT). Fechas-hora en UTC ("2026-09-26T16:00:00Z").
 *  - IDs internos propios (INTEGER PK). Los IDs de cada fuente (acb, feb, ...)
 *    viven en `external_ids`, así un mismo jugador puede enlazarse entre ACB y LEB.
 *  - Estadísticas por periodo: period = 0 es el partido completo, 1-4 cuartos, 5+ prórrogas.
 */
export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: /* sql */ `
-- ───────────────────────── Catálogo: competiciones y temporadas ─────────────────────────
CREATE TABLE competitions (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,            -- 'ACB' | 'LEB_ORO' | 'LEB_PLATA' | 'COPA' ...
  name          TEXT NOT NULL,                   -- 'Liga Endesa'
  short_name    TEXT,
  organizer     TEXT NOT NULL,                   -- 'ACB' | 'FEB'
  tier          INTEGER,                         -- 1 = ACB, 2 = LEB Oro, 3 = LEB Plata
  gender        TEXT NOT NULL DEFAULT 'M' CHECK (gender IN ('M','F')),
  country       TEXT NOT NULL DEFAULT 'ES'
);

INSERT INTO competitions (code, name, short_name, organizer, tier) VALUES
  ('ACB',       'Liga Endesa',  'ACB',       'ACB', 1),
  ('LEB_ORO',   'Primera FEB',  'LEB Oro',   'FEB', 2),
  ('LEB_PLATA', 'Segunda FEB',  'LEB Plata', 'FEB', 3);

CREATE TABLE seasons (
  id            INTEGER PRIMARY KEY,
  start_year    INTEGER NOT NULL UNIQUE,         -- 2026
  end_year      INTEGER NOT NULL,                -- 2027
  label         TEXT NOT NULL,                   -- '2026-27'
  CHECK (end_year = start_year + 1)
);

-- Una competición en una temporada ("edición"): la unidad de scraping.
CREATE TABLE competition_seasons (
  id              INTEGER PRIMARY KEY,
  competition_id  INTEGER NOT NULL REFERENCES competitions(id),
  season_id       INTEGER NOT NULL REFERENCES seasons(id),
  name            TEXT,                          -- 'Liga Endesa 2026-27'
  start_date      TEXT,
  end_date        TEXT,
  is_current      INTEGER NOT NULL DEFAULT 0,
  last_synced_at  TEXT,
  UNIQUE (competition_id, season_id)
);

-- ───────────────────────── Clubes y equipos ─────────────────────────
-- Club: entidad estable a lo largo de los años (Real Madrid, Unicaja...).
CREATE TABLE clubs (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,                   -- nombre más reciente conocido
  short_name    TEXT,
  abbreviation  TEXT,
  city          TEXT,
  country       TEXT DEFAULT 'ES',
  arena         TEXT,
  website       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Equipo: un club inscrito en una edición (nombre de patrocinio, colores y logo de ese año).
CREATE TABLE teams (
  id                     INTEGER PRIMARY KEY,
  club_id                INTEGER NOT NULL REFERENCES clubs(id),
  competition_season_id  INTEGER NOT NULL REFERENCES competition_seasons(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,          -- 'Kosner Baskonia'
  short_name             TEXT,
  abbreviation           TEXT,                   -- 'BKN'
  primary_color          TEXT,
  text_color             TEXT,
  logo_url               TEXT,
  source_slug            TEXT,                   -- slug de la URL oficial (p.ej. 'real-madrid-9')
  UNIQUE (club_id, competition_season_id)
);

-- ───────────────────────── Personas ─────────────────────────
-- Jugador: entidad estable entre temporadas y ligas.
CREATE TABLE players (
  id              INTEGER PRIMARY KEY,
  first_name      TEXT,
  last_name       TEXT,
  full_name       TEXT NOT NULL,
  known_as        TEXT,                          -- 'Facu Campazzo'
  birth_date      TEXT,                          -- 'YYYY-MM-DD'
  birth_place     TEXT,
  birth_country   TEXT,
  nationality     TEXT,
  height_cm       INTEGER,
  weight_kg       INTEGER,
  position        TEXT,                          -- posición oficial más reciente ('Base', 'Escolta'...)
  position_code   TEXT CHECK (position_code IN ('PG','SG','SF','PF','C') OR position_code IS NULL),
  photo_url       TEXT,
  bio_synced_at   TEXT,                          -- última vez que se leyó la ficha completa
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX ix_players_name ON players(last_name, first_name);

CREATE TABLE coaches (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT,
  last_name     TEXT,
  full_name     TEXT NOT NULL,
  nationality   TEXT,
  photo_url     TEXT
);

-- Plantilla: jugador en un equipo-temporada.
CREATE TABLE roster_entries (
  id              INTEGER PRIMARY KEY,
  team_id         INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  jersey_number   TEXT,
  position        TEXT,
  position_code   TEXT,
  license_type    TEXT,                          -- ACB: 'JFL' (formación local), 'EUR', 'EXT', 'COT'
  is_active       INTEGER NOT NULL DEFAULT 1,    -- 0 = baja
  joined_on       TEXT,
  left_on         TEXT,
  last_seen_at    TEXT,                          -- última sincronización en la que aparecía
  UNIQUE (team_id, player_id)
);
CREATE INDEX ix_roster_player ON roster_entries(player_id);

CREATE TABLE team_staff (
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id   INTEGER NOT NULL REFERENCES coaches(id),
  role       TEXT NOT NULL CHECK (role IN ('head_coach','assistant_coach','other')),
  PRIMARY KEY (team_id, coach_id, role)
);

-- ───────────────────────── Mapeo con fuentes externas ─────────────────────────
-- Un registro por (entidad, fuente). Permite cruzar ACB, FEB, Proballers, Basketball-Reference...
CREATE TABLE external_ids (
  entity_type   TEXT NOT NULL CHECK (entity_type IN
                  ('competition_season','club','team','player','coach','game','round')),
  entity_id     INTEGER NOT NULL,
  source        TEXT NOT NULL,                   -- 'acb' | 'feb' | 'proballers' | 'bref' ...
  external_id   TEXT NOT NULL,
  url           TEXT,
  PRIMARY KEY (entity_type, source, external_id)
);
CREATE INDEX ix_external_ids_entity ON external_ids(entity_type, entity_id);

-- ───────────────────────── Calendario y partidos ─────────────────────────
CREATE TABLE rounds (
  id                     INTEGER PRIMARY KEY,
  competition_season_id  INTEGER NOT NULL REFERENCES competition_seasons(id) ON DELETE CASCADE,
  phase                  TEXT NOT NULL DEFAULT 'regular',  -- 'regular' | 'playoff' | 'copa' ...
  number                 INTEGER NOT NULL,                 -- jornada / eliminatoria
  name                   TEXT,                             -- 'Jornada 1', 'Cuartos de final'
  start_date             TEXT,
  end_date               TEXT,
  UNIQUE (competition_season_id, phase, number)
);

CREATE TABLE games (
  id                     INTEGER PRIMARY KEY,
  competition_season_id  INTEGER NOT NULL REFERENCES competition_seasons(id) ON DELETE CASCADE,
  round_id               INTEGER REFERENCES rounds(id),
  home_team_id           INTEGER NOT NULL REFERENCES teams(id),
  away_team_id           INTEGER NOT NULL REFERENCES teams(id),
  scheduled_at           TEXT,                   -- ISO UTC; NULL si no hay fecha
  status                 TEXT NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled','unscheduled','live','finished','postponed','suspended')),
  home_score             INTEGER,
  away_score             INTEGER,
  periods_played         INTEGER,                -- 4 = sin prórroga
  arena                  TEXT,
  attendance             INTEGER,
  referees               TEXT,                   -- JSON: ["Árbitro 1", "Árbitro 2", ...]
  boxscore_synced_at     TEXT,
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (home_team_id <> away_team_id)
);
CREATE INDEX ix_games_season_date ON games(competition_season_id, scheduled_at);
CREATE INDEX ix_games_home ON games(home_team_id);
CREATE INDEX ix_games_away ON games(away_team_id);

CREATE TABLE game_period_scores (
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  period       INTEGER NOT NULL CHECK (period >= 1),
  home_points  INTEGER NOT NULL,
  away_points  INTEGER NOT NULL,
  PRIMARY KEY (game_id, period)
);

-- ───────────────────────── Estadísticas ─────────────────────────
-- Boxscore individual. period = 0 → partido completo; 1..4 → cuartos; 5+ → prórrogas.
CREATE TABLE player_game_stats (
  game_id        INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  period         INTEGER NOT NULL DEFAULT 0,
  player_id      INTEGER NOT NULL REFERENCES players(id),
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  jersey_number  TEXT,
  is_starter     INTEGER NOT NULL DEFAULT 0,
  seconds        INTEGER NOT NULL DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  fg2m INTEGER NOT NULL DEFAULT 0,  fg2a INTEGER NOT NULL DEFAULT 0,
  fg3m INTEGER NOT NULL DEFAULT 0,  fg3a INTEGER NOT NULL DEFAULT 0,
  ftm  INTEGER NOT NULL DEFAULT 0,  fta  INTEGER NOT NULL DEFAULT 0,
  oreb INTEGER NOT NULL DEFAULT 0,  dreb INTEGER NOT NULL DEFAULT 0,  reb INTEGER NOT NULL DEFAULT 0,
  ast  INTEGER NOT NULL DEFAULT 0,  stl  INTEGER NOT NULL DEFAULT 0,  tov INTEGER NOT NULL DEFAULT 0,
  blk  INTEGER NOT NULL DEFAULT 0,  blk_against INTEGER NOT NULL DEFAULT 0,
  dunks INTEGER NOT NULL DEFAULT 0,
  pf   INTEGER NOT NULL DEFAULT 0,  fouls_drawn INTEGER NOT NULL DEFAULT 0,
  plus_minus     INTEGER,
  pir            INTEGER,                        -- valoración (PIR / "val")
  PRIMARY KEY (game_id, period, player_id)
);
CREATE INDEX ix_pgs_player ON player_game_stats(player_id, period);
CREATE INDEX ix_pgs_team ON player_game_stats(team_id, period);

-- Totales de equipo por partido y periodo. team_* = acciones atribuidas al equipo (no a un jugador).
CREATE TABLE team_game_stats (
  game_id        INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  period         INTEGER NOT NULL DEFAULT 0,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  is_home        INTEGER NOT NULL,
  points         INTEGER NOT NULL DEFAULT 0,
  fg2m INTEGER NOT NULL DEFAULT 0,  fg2a INTEGER NOT NULL DEFAULT 0,
  fg3m INTEGER NOT NULL DEFAULT 0,  fg3a INTEGER NOT NULL DEFAULT 0,
  ftm  INTEGER NOT NULL DEFAULT 0,  fta  INTEGER NOT NULL DEFAULT 0,
  oreb INTEGER NOT NULL DEFAULT 0,  dreb INTEGER NOT NULL DEFAULT 0,  reb INTEGER NOT NULL DEFAULT 0,
  ast  INTEGER NOT NULL DEFAULT 0,  stl  INTEGER NOT NULL DEFAULT 0,  tov INTEGER NOT NULL DEFAULT 0,
  blk  INTEGER NOT NULL DEFAULT 0,  blk_against INTEGER NOT NULL DEFAULT 0,
  dunks INTEGER NOT NULL DEFAULT 0,
  pf   INTEGER NOT NULL DEFAULT 0,  fouls_drawn INTEGER NOT NULL DEFAULT 0,
  pir            INTEGER,
  team_oreb INTEGER NOT NULL DEFAULT 0, team_dreb INTEGER NOT NULL DEFAULT 0, team_tov INTEGER NOT NULL DEFAULT 0,
  head_coach     TEXT,
  PRIMARY KEY (game_id, period, team_id)
);

-- ───────────────────────── Scouting cualitativo ─────────────────────────
CREATE TABLE scouting_reports (
  id              INTEGER PRIMARY KEY,
  player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id       INTEGER REFERENCES seasons(id),
  team_id         INTEGER REFERENCES teams(id),
  author          TEXT,
  report_date     TEXT NOT NULL DEFAULT (date('now')),
  role            TEXT,                          -- rol en su equipo
  archetype       TEXT,                          -- '3&D', 'pívot de bloqueo y continuación'...
  strengths       TEXT,
  weaknesses      TEXT,
  offense_notes   TEXT,
  defense_notes   TEXT,
  physical_notes  TEXT,
  intangibles     TEXT,
  comparables     TEXT,                          -- jugadores comparables
  projection      TEXT,                          -- proyección / techo
  current_level   INTEGER CHECK (current_level BETWEEN 1 AND 10),
  potential       INTEGER CHECK (potential BETWEEN 1 AND 10),
  recommendation  TEXT CHECK (recommendation IN ('fichar','seguir','descartar') OR recommendation IS NULL),
  games_watched   TEXT,                          -- JSON con ids de partidos vistos
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX ix_scouting_player ON scouting_reports(player_id, report_date);

-- Notas por atributo (1-10) dentro de un informe: tiro, pase, defensa exterior...
CREATE TABLE scouting_ratings (
  report_id  INTEGER NOT NULL REFERENCES scouting_reports(id) ON DELETE CASCADE,
  attribute  TEXT NOT NULL,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  note       TEXT,
  PRIMARY KEY (report_id, attribute)
);

-- ───────────────────────── Operación del scraper ─────────────────────────
CREATE TABLE scrape_runs (
  id                     INTEGER PRIMARY KEY,
  source                 TEXT NOT NULL,          -- 'acb'
  competition_season_id  INTEGER REFERENCES competition_seasons(id),
  scope                  TEXT,                   -- 'calendar,rosters,players,boxscores'
  started_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  finished_at            TEXT,
  status                 TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','error')),
  requests               INTEGER NOT NULL DEFAULT 0,
  summary                TEXT,                   -- JSON con contadores
  errors                 TEXT                    -- JSON con errores no fatales
);

-- ───────────────────────── Vistas ─────────────────────────
CREATE VIEW v_player_season_stats AS
SELECT
  p.id AS player_id, p.full_name, t.id AS team_id, t.name AS team_name,
  t.competition_season_id,
  COUNT(*)                                   AS games,
  SUM(s.is_starter)                          AS starts,
  SUM(s.seconds)                             AS seconds,
  SUM(s.fg2a + s.fg3a)                       AS fga,
  SUM(s.fta)                                 AS fta,
  ROUND(SUM(s.seconds) / 60.0 / COUNT(*), 1) AS mpg,
  ROUND(AVG(s.points), 1)                    AS ppg,
  ROUND(AVG(s.reb), 1)                       AS rpg,
  ROUND(AVG(s.ast), 1)                       AS apg,
  ROUND(AVG(s.stl), 1)                       AS spg,
  ROUND(AVG(s.blk), 1)                       AS bpg,
  ROUND(AVG(s.tov), 1)                       AS tpg,
  ROUND(AVG(s.pir), 1)                       AS pir,
  ROUND(100.0 * SUM(s.fg2m + s.fg3m) / NULLIF(SUM(s.fg2a + s.fg3a), 0), 1) AS fg_pct,
  ROUND(100.0 * SUM(s.fg2m) / NULLIF(SUM(s.fg2a), 0), 1)                  AS fg2_pct,
  ROUND(100.0 * SUM(s.fg3m) / NULLIF(SUM(s.fg3a), 0), 1)                  AS fg3_pct,
  ROUND(100.0 * SUM(s.ftm) / NULLIF(SUM(s.fta), 0), 1)                    AS ft_pct,
  -- True Shooting % = PTS / (2 * (FGA + 0.44 * FTA))
  ROUND(100.0 * SUM(s.points) / NULLIF(2 * (SUM(s.fg2a + s.fg3a) + 0.44 * SUM(s.fta)), 0), 1) AS ts_pct,
  -- eFG% = (FGM + 0.5 * 3PM) / FGA
  ROUND(100.0 * (SUM(s.fg2m + s.fg3m) + 0.5 * SUM(s.fg3m)) / NULLIF(SUM(s.fg2a + s.fg3a), 0), 1) AS efg_pct
FROM player_game_stats s
JOIN players p ON p.id = s.player_id
JOIN teams t   ON t.id = s.team_id
WHERE s.period = 0 AND s.seconds > 0
GROUP BY p.id, t.id;

-- Clasificación de liga regular calculada a partir de los resultados.
CREATE VIEW v_standings AS
WITH regular AS (
  SELECT g.* FROM games g LEFT JOIN rounds rd ON rd.id = g.round_id
  WHERE g.status = 'finished' AND COALESCE(rd.phase, 'regular') = 'regular'
),
results AS (
  SELECT competition_season_id, home_team_id AS team_id,
         (home_score > away_score) AS won, home_score AS pf, away_score AS pa
  FROM regular
  UNION ALL
  SELECT competition_season_id, away_team_id,
         (away_score > home_score), away_score, home_score
  FROM regular
)
SELECT r.competition_season_id, r.team_id, t.name AS team_name, t.logo_url,
       COUNT(*) AS played, SUM(r.won) AS won, COUNT(*) - SUM(r.won) AS lost,
       SUM(r.pf) AS points_for, SUM(r.pa) AS points_against,
       SUM(r.pf) - SUM(r.pa) AS diff
FROM results r JOIN teams t ON t.id = r.team_id
GROUP BY r.competition_season_id, r.team_id;
`
  }
]
