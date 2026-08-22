-- uuid_generate_v4(), used by every table's id column default, comes from
-- this extension — it was apparently enabled by hand on whatever Postgres
-- install this repo was originally developed against, and no migration or
-- init script ever created it. M13 (a genuinely fresh `docker compose up`)
-- is what surfaced the gap: without this, `migration:run` fails on the very
-- first CREATE TABLE with "function uuid_generate_v4() does not exist".
-- Both databases need it — splitlab (dev/docker-compose) and splitlab_test
-- (the host-run e2e suites' migration:run:test).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE DATABASE splitlab_test;

\c splitlab_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
