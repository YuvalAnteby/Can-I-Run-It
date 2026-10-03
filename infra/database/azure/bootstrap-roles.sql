-- psql script; execute as the configured human Microsoft Entra administrator.
-- See docs/operations/azure-database.md. Never execute through the HTTP API.
-- Connect initially to postgres. Requires: app_db, runtime_oid, migrator_oid,
-- exporter_oid (managed-identity principal/object IDs, NOT client IDs).
\set ON_ERROR_STOP on
\if :{?app_db}
\else
  \echo 'Missing -v app_db=<database>'
  SELECT 1/0; -- PostgreSQL 16 ignores a numeric argument to \quit; ON_ERROR_STOP must fail.
\endif
\if :{?runtime_oid}
\else
  \echo 'Missing -v runtime_oid=<principal-id>'
  SELECT 1/0;
\endif
\if :{?migrator_oid}
\else
  \echo 'Missing -v migrator_oid=<principal-id>'
  SELECT 1/0;
\endif
\if :{?exporter_oid}
\else
  \echo 'Missing -v exporter_oid=<principal-id>'
  SELECT 1/0;
\endif

SELECT current_database() = 'postgres' AS on_postgres,
       :'app_db' ~ '^[a-z][a-z0-9_]{0,62}$' AND :'app_db' <> 'postgres' AS valid_db
\gset
\if :on_postgres
\else
  \echo 'Connect initially to the postgres database.'
  SELECT 1/0;
\endif
\if :valid_db
\else
  \echo 'app_db must be a separate lowercase application database name.'
  SELECT 1/0;
\endif

BEGIN;
SELECT pg_advisory_xact_lock(1128878665, 1);
CREATE TEMP TABLE ciri_principals (role_name text PRIMARY KEY, object_id uuid UNIQUE NOT NULL);
INSERT INTO ciri_principals VALUES
  ('ciri-runtime', :'runtime_oid'::uuid),
  ('ciri-migrator', :'migrator_oid'::uuid),
  ('ciri-exporter', :'exporter_oid'::uuid);

DO $bootstrap$
DECLARE
  desired record;
  mapping jsonb;
  mapped_oid text;
  mapped_type text;
  mapped_admin text;
BEGIN
  FOR desired IN SELECT * FROM ciri_principals LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = desired.role_name) THEN
      PERFORM pg_catalog.pgaadauth_create_principal_with_oid(
        desired.role_name, desired.object_id::text, 'service', false, false);
    END IF;

    -- JSON handles both quoted and folded column names across extension versions.
    SELECT to_jsonb(p) INTO mapping
      FROM pg_catalog.pgaadauth_list_principals(false) AS p
      WHERE to_jsonb(p)->>'rolename' = desired.role_name;
    mapped_oid := COALESCE(mapping->>'objectId', mapping->>'objectid');
    mapped_type := COALESCE(mapping->>'principalType', mapping->>'principaltype');
    mapped_admin := COALESCE(mapping->>'isAdmin', mapping->>'isadmin');
    IF mapped_oid IS NULL OR mapped_oid::uuid <> desired.object_id
       OR mapped_type IS DISTINCT FROM 'service'
       OR mapped_admin IS DISTINCT FROM '0' THEN
      RAISE EXCEPTION 'Role % has a missing or conflicting Entra mapping; refusing to remap.', desired.role_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = desired.role_name
               AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
       OR EXISTS (SELECT 1 FROM pg_auth_members
                  WHERE member = (SELECT oid FROM pg_roles WHERE rolname = desired.role_name)) THEN
      RAISE EXCEPTION 'Role % has elevated flags or role memberships; review before rerunning.', desired.role_name;
    END IF;
    EXECUTE format('ALTER ROLE %I LOGIN NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', desired.role_name);
  END LOOP;
END;
$bootstrap$;
COMMIT;

-- Roles are cluster-wide; application privileges are database-specific.
\connect :app_db
BEGIN;
SELECT pg_advisory_xact_lock(1128878665, 2);
CREATE TEMP TABLE ciri_bootstrap_context ON COMMIT DROP AS
  SELECT session_user::text AS admin_role,
    EXISTS (SELECT 1 FROM pg_auth_members
            WHERE roleid = (SELECT oid FROM pg_roles WHERE rolname = 'ciri-migrator')
              AND member = (SELECT oid FROM pg_roles WHERE rolname = session_user)) AS had_membership;

-- Fresh setup or rerun only. Existing objects must already belong to the migrator.
-- Never silently transfer an existing application database's ownership.
DO $ownership$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S','v','m','f')
               AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = 'ciri-migrator')) THEN
    RAISE EXCEPTION 'Existing public objects have another owner. Follow the ownership migration runbook first.';
  END IF;
END;
$ownership$;

SELECT format('GRANT %I TO %I', 'ciri-migrator', admin_role)
FROM ciri_bootstrap_context WHERE NOT had_membership
\gexec

REVOKE ALL ON DATABASE :"app_db" FROM PUBLIC;
REVOKE ALL ON DATABASE :"app_db" FROM "ciri-runtime", "ciri-exporter", "ciri-migrator";
GRANT CONNECT ON DATABASE :"app_db" TO "ciri-runtime", "ciri-exporter", "ciri-migrator";
-- Explicit seed stages fixture rows in temporary tables. No database CREATE.
GRANT TEMPORARY ON DATABASE :"app_db" TO "ciri-migrator";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO "ciri-migrator";
SET LOCAL ROLE "ciri-migrator";
REVOKE ALL ON SCHEMA public FROM "ciri-runtime", "ciri-exporter";
GRANT USAGE ON SCHEMA public TO "ciri-runtime", "ciri-exporter";
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, "ciri-runtime", "ciri-exporter";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, "ciri-runtime", "ciri-exporter";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "ciri-runtime", "ciri-exporter";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "ciri-exporter";

-- Reset global AND schema defaults before the minimal grants. A schema revoke
-- cannot remove a global grant, and simply adding SELECT leaves drifted writes.
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator"
  REVOKE ALL ON TABLES FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator"
  REVOKE ALL ON SEQUENCES FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator"
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator"
  REVOKE ALL ON TYPES FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  REVOKE ALL ON TYPES FROM PUBLIC, "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator"
  REVOKE ALL ON SCHEMAS FROM PUBLIC, "ciri-runtime", "ciri-exporter";

ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  GRANT SELECT ON TABLES TO "ciri-runtime", "ciri-exporter";
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO "ciri-exporter";
-- Global revoke is needed: a schema-scoped revoke cannot undo global defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
  GRANT USAGE ON TYPES TO "ciri-runtime", "ciri-exporter";

-- Writes are explicit, never inherited by unrelated future tables.
-- Rerun after schema installation/migrations; missing tables are skipped at first bootstrap.
DO $data_grants$
DECLARE
  table_name text;
  sequence_name text;
  type_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cpus','gpus','games','game_requirements','performance_records'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT INSERT, UPDATE ON TABLE public.%I TO %I', table_name, 'ciri-runtime');
      sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
      IF sequence_name IS NOT NULL THEN
        EXECUTE format('GRANT USAGE ON SEQUENCE %s TO %I', sequence_name, 'ciri-runtime');
      END IF;
    END IF;
  END LOOP;
  FOR type_name IN SELECT t.typname FROM pg_type t
                  JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'public' AND t.typtype IN ('e','d') LOOP
    EXECUTE format('REVOKE USAGE ON TYPE public.%I FROM PUBLIC', type_name);
    EXECUTE format('GRANT USAGE ON TYPE public.%I TO %I, %I', type_name, 'ciri-runtime', 'ciri-exporter');
  END LOOP;
END;
$data_grants$;
RESET ROLE;
SELECT format('REVOKE %I FROM %I', 'ciri-migrator', admin_role)
FROM ciri_bootstrap_context WHERE NOT had_membership
\gexec
COMMIT;

\echo 'CIRI Entra mappings and database grants applied. Rerun after schema setup.'
