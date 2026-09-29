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
  },
  {
    version: 2,
    name: 'club_details_honours_careers',
    sql: /* sql */ `
-- ───────── Ficha de club (acb.com: datos del club en la página de plantilla) ─────────
ALTER TABLE clubs ADD COLUMN founded_year INTEGER;
ALTER TABLE clubs ADD COLUMN arena_address TEXT;
ALTER TABLE clubs ADD COLUMN arena_capacity INTEGER;
ALTER TABLE clubs ADD COLUMN arena_photo_url TEXT;
ALTER TABLE clubs ADD COLUMN logo_url TEXT;
ALTER TABLE clubs ADD COLUMN primary_color TEXT;
ALTER TABLE clubs ADD COLUMN president TEXT;
ALTER TABLE clubs ADD COLUMN socials TEXT;               -- JSON: { instagram, twitter, facebook, youtube, tiktok, tickets, shop }
ALTER TABLE clubs ADD COLUMN history TEXT;               -- resumen de su historia (Wikipedia, CC BY-SA)
ALTER TABLE clubs ADD COLUMN history_url TEXT;

-- ───────── Jugador: fotos sin fondo y carrera oficial ─────────
ALTER TABLE players ADD COLUMN photo_nobg_url TEXT;      -- cara con fondo transparente
ALTER TABLE players ADD COLUMN body_photo_url TEXT;      -- cuerpo entero sin fondo
ALTER TABLE players ADD COLUMN career TEXT;              -- JSON: totales/medias ACB, todas las competiciones y récords
ALTER TABLE players ADD COLUMN source_editions TEXT;     -- JSON: ids de edición (acb) en los que ha jugado
ALTER TABLE players ADD COLUMN socials TEXT;             -- JSON

-- Trayectoria temporada a temporada (agregada de los partidos oficiales de cada temporada).
-- Permite mostrar toda la carrera sin guardar cada partido histórico.
CREATE TABLE player_season_lines (
  player_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  competition_code   TEXT NOT NULL,                       -- 'ACB'
  season_start_year  INTEGER NOT NULL,
  club_source_id     TEXT NOT NULL,                       -- id del club en la fuente (acb)
  club_id            INTEGER REFERENCES clubs(id),
  team_name          TEXT NOT NULL,
  team_abbr          TEXT,
  games              INTEGER NOT NULL DEFAULT 0,
  playoff_games      INTEGER NOT NULL DEFAULT 0,
  wins               INTEGER NOT NULL DEFAULT 0,
  seconds            INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  fg2m INTEGER NOT NULL DEFAULT 0, fg2a INTEGER NOT NULL DEFAULT 0,
  fg3m INTEGER NOT NULL DEFAULT 0, fg3a INTEGER NOT NULL DEFAULT 0,
  ftm  INTEGER NOT NULL DEFAULT 0, fta  INTEGER NOT NULL DEFAULT 0,
  oreb INTEGER NOT NULL DEFAULT 0, dreb INTEGER NOT NULL DEFAULT 0, reb INTEGER NOT NULL DEFAULT 0,
  ast  INTEGER NOT NULL DEFAULT 0, stl  INTEGER NOT NULL DEFAULT 0, tov INTEGER NOT NULL DEFAULT 0,
  blk  INTEGER NOT NULL DEFAULT 0, dunks INTEGER NOT NULL DEFAULT 0,
  pf   INTEGER NOT NULL DEFAULT 0, fouls_drawn INTEGER NOT NULL DEFAULT 0,
  pir  INTEGER NOT NULL DEFAULT 0, plus_minus INTEGER NOT NULL DEFAULT 0,
  fetched_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (player_id, competition_code, season_start_year, club_source_id)
);

-- Temporadas ya consultadas por jugador (aunque no jugase ningún partido).
CREATE TABLE player_season_fetches (
  player_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  edition_source_id  TEXT NOT NULL,
  fetched_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (player_id, edition_source_id)
);

-- ───────── Historia: palmarés y clasificación histórica ─────────
CREATE TABLE honours (
  id                 INTEGER PRIMARY KEY,
  competition        TEXT NOT NULL CHECK (competition IN ('liga','copa','supercopa')),
  season_start_year  INTEGER NOT NULL,
  label              TEXT NOT NULL,                       -- '2025-26' o '2026'
  champion_name      TEXT NOT NULL,
  champion_club_id   INTEGER REFERENCES clubs(id),
  runner_up_name     TEXT,
  runner_up_club_id  INTEGER REFERENCES clubs(id),
  result             TEXT,
  note               TEXT,
  source             TEXT NOT NULL DEFAULT 'wikipedia',
  UNIQUE (competition, season_start_year)
);
CREATE INDEX ix_honours_champion ON honours(champion_club_id);
CREATE INDEX ix_honours_runner ON honours(runner_up_club_id);

-- Clasificación histórica oficial (acb.com: ranking de clubes + cuadro de honor).
CREATE TABLE club_records (
  club_id          INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  scope            TEXT NOT NULL CHECK (scope IN ('acb','total')),   -- 'acb' = desde 1983-84; 'total' = desde 1956-57
  position         INTEGER,
  seasons          INTEGER,
  games            INTEGER,
  wins             INTEGER,
  losses           INTEGER,
  ties             INTEGER,
  points_for       INTEGER,
  points_against   INTEGER,
  best_margin      INTEGER,
  worst_margin     INTEGER,
  first_places     INTEGER,
  second_places    INTEGER,
  third_places     INTEGER,
  fourth_places    INTEGER,
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (club_id, scope)
);

-- Metadatos varios (p.ej. última actualización del histórico).
CREATE TABLE app_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

-- Referencias estables para las URLs de la interfaz: id de acb.com o, si no existe, 'i<id interno>'.
CREATE VIEW v_club_ref AS
  SELECT c.id AS club_id, COALESCE(x.external_id, 'i' || c.id) AS ref
  FROM clubs c LEFT JOIN external_ids x ON x.entity_type = 'club' AND x.entity_id = c.id AND x.source = 'acb';
CREATE VIEW v_player_ref AS
  SELECT p.id AS player_id, COALESCE(x.external_id, 'i' || p.id) AS ref
  FROM players p LEFT JOIN external_ids x ON x.entity_type = 'player' AND x.entity_id = p.id AND x.source = 'acb';
CREATE VIEW v_game_ref AS
  SELECT g.id AS game_id, COALESCE(x.external_id, 'i' || g.id) AS ref
  FROM games g LEFT JOIN external_ids x ON x.entity_type = 'game' AND x.entity_id = g.id AND x.source = 'acb';
`
  },
  {
    version: 3,
    name: 'feb_and_career_stints',
    sql: /* sql */ `
-- Trayectoria completa por etapas (una licencia en un club y temporada), de cualquier
-- categoría: la FEB publica la carrera entera de cada jugador (EBA, LEB Plata, Primera FEB...).
CREATE TABLE player_stints (
  player_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source             TEXT NOT NULL,              -- 'feb'
  season_start_year  INTEGER NOT NULL,
  competition        TEXT NOT NULL,              -- 'PRIMERA FEB', 'LIGA EBA'...
  club_name          TEXT NOT NULL,
  team_name          TEXT,
  license            TEXT,
  joined_on          TEXT,
  left_on            TEXT,
  PRIMARY KEY (player_id, source, season_start_year, competition, club_name)
);

-- Referencias estables también para la FEB: 'f<id>' (acb conserva su id tal cual).
DROP VIEW v_club_ref;
DROP VIEW v_player_ref;
DROP VIEW v_game_ref;
CREATE VIEW v_club_ref AS
  SELECT c.id AS club_id, COALESCE(a.external_id, 'f' || f.external_id, 'i' || c.id) AS ref
  FROM clubs c
  LEFT JOIN external_ids a ON a.entity_type = 'club' AND a.entity_id = c.id AND a.source = 'acb'
  LEFT JOIN external_ids f ON f.entity_type = 'club' AND f.entity_id = c.id AND f.source = 'feb';
CREATE VIEW v_player_ref AS
  SELECT p.id AS player_id, COALESCE(a.external_id, 'f' || f.external_id, 'i' || p.id) AS ref
  FROM players p
  LEFT JOIN external_ids a ON a.entity_type = 'player' AND a.entity_id = p.id AND a.source = 'acb'
  LEFT JOIN external_ids f ON f.entity_type = 'player' AND f.entity_id = p.id AND f.source = 'feb';
CREATE VIEW v_game_ref AS
  SELECT g.id AS game_id, COALESCE(a.external_id, 'f' || f.external_id, 'i' || g.id) AS ref
  FROM games g
  LEFT JOIN external_ids a ON a.entity_type = 'game' AND a.entity_id = g.id AND a.source = 'acb'
  LEFT JOIN external_ids f ON f.entity_type = 'game' AND f.entity_id = g.id AND f.source = 'feb';
`
  },
  {
    version: 4,
    name: 'team_groups',
    sql: /* sql */ `
-- Ligas divididas en grupos (Segunda FEB: grupos A y B). NULL = liga de grupo único.
ALTER TABLE teams ADD COLUMN group_name TEXT;
`
  },
  {
    version: 5,
    name: 'tercera_feb',
    sql: /* sql */ `
-- Tercera FEB (antigua Liga EBA): cuarta categoría, 10 grupos territoriales.
INSERT OR IGNORE INTO competitions (code, name, short_name, organizer, tier) VALUES
  ('TERCERA_FEB', 'Tercera FEB', 'Tercera FEB', 'FEB', 4);
`
  },
  {
    version: 6,
    name: 'club_secondary_color',
    sql: /* sql */ `
-- Segundo color del club (sacado de su escudo, ver src/db/media.ts).
ALTER TABLE clubs ADD COLUMN secondary_color TEXT;
`
  },
  {
    version: 7,
    name: 'club_ref_one_feb_id',
    sql: /* sql */ `
-- La FEB cambia el id de equipo cada temporada: un club con varias temporadas tiene varios
-- ids FEB. La referencia estable es la del más reciente (un único valor por club).
DROP VIEW v_club_ref;
CREATE VIEW v_club_ref AS
  SELECT c.id AS club_id, COALESCE(
    (SELECT external_id FROM external_ids WHERE entity_type = 'club' AND entity_id = c.id AND source = 'acb' LIMIT 1),
    'f' || (SELECT MAX(CAST(external_id AS INTEGER)) FROM external_ids WHERE entity_type = 'club' AND entity_id = c.id AND source = 'feb'),
    'i' || c.id) AS ref
  FROM clubs c;
`
  }
]
