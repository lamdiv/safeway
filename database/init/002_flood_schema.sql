-- SafeWay / Headwater flood-response schema.
-- This deliberately models flood scenarios only; no Los Angeles wildfire dataset
-- or wildfire-specific assumptions are introduced here.

BEGIN;

CREATE TABLE incidents (
  incident_id text PRIMARY KEY,
  name text NOT NULL,
  hazard_kind text NOT NULL CHECK (hazard_kind IN ('flood', 'flash_flood', 'river_flood')),
  scenario_kind text NOT NULL CHECK (scenario_kind IN ('historical', 'hypothetical', 'exercise')),
  started_at timestamptz,
  ended_at timestamptz,
  area geometry(Geometry, 4326),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

-- One feature can be observed repeatedly. The time-inclusive primary key is
-- required by TimescaleDB because observed_at is its partitioning dimension.
CREATE TABLE hazard_observations (
  incident_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  feature_id text NOT NULL,
  source text NOT NULL,
  geom geometry(Geometry, 4326) NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (incident_id, observed_at, feature_id),
  CHECK (ST_SRID(geom) = 4326)
);

SELECT create_hypertable(
  'hazard_observations',
  by_range('observed_at', INTERVAL '7 days'),
  if_not_exists => TRUE
);

CREATE INDEX hazard_observations_geom_gix
  ON hazard_observations USING gist (geom);
CREATE INDEX hazard_observations_incident_feature_time_idx
  ON hazard_observations (incident_id, feature_id, observed_at DESC);

-- A row represents a closure interval. Its primary key includes blocked_at so a
-- passage may be blocked, cleared, and blocked again in one drill session.
CREATE TABLE passage_events (
  session_id uuid NOT NULL,
  passage_id text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cleared_at timestamptz,
  source text NOT NULL DEFAULT 'operator',
  reason text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (session_id, passage_id, blocked_at),
  CHECK (cleared_at IS NULL OR cleared_at >= blocked_at)
);

SELECT create_hypertable(
  'passage_events',
  by_range('blocked_at', INTERVAL '30 days'),
  if_not_exists => TRUE
);

CREATE INDEX passage_events_active_idx
  ON passage_events (session_id, passage_id)
  WHERE cleared_at IS NULL;

CREATE VIEW current_hazard_observations AS
SELECT DISTINCT ON (incident_id, feature_id)
  incident_id, feature_id, observed_at, source, geom, properties
FROM hazard_observations
ORDER BY incident_id, feature_id, observed_at DESC;

CREATE VIEW active_passage_blocks AS
SELECT session_id, passage_id, blocked_at, source, reason, properties
FROM passage_events
WHERE cleared_at IS NULL;

COMMENT ON TABLE hazard_observations IS
  'Time-series flood hazard observations in WGS84/PostGIS. Source geometry is evidence, not a forecast.';
COMMENT ON TABLE passage_events IS
  'Route/passage closure intervals for an exercise session. These are not real road-closure feeds.';

COMMIT;
