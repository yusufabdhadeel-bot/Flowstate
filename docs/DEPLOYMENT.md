# Deployment and operations guide

## Readiness status

The repository includes a Docker image and a single-host Compose setup suitable for local use or an isolated staging trial. These files are not, by themselves, a highly available or production-managed deployment. No production platform, external secret manager, alert destination, backup schedule, or staging service is configured here.

## Environment separation

Use a distinct database, credentials, JWT secret, MFA encryption key, allowed origins, and deployment project for each environment. The tracked `.env.example`, `.env.staging.example`, and `.env.production.example` files are templates only. Their JWT and MFA values intentionally use `REPLACE_ME` and must be replaced with high-entropy secrets before startup/use. Copy the relevant template to an ignored runtime file and replace every placeholder. Never reuse production credentials or copy production data to staging without approved sanitization.

Compose loads the selected file for variable substitution; the Compose service declarations pass only the listed variables to containers. Keep runtime files access-restricted and out of source control. Compose environment variables are not a production secret manager: host administrators and users with Docker access can inspect them. For production, inject secrets through the deployment platform and use a managed PostgreSQL service.

The `SECRET_MANAGER` setting currently selects no integration. `src/config/env.ts` only validates its value; AWS Secrets Manager, Azure Key Vault, and other providers are not fetched by this application.

## Staging with Compose

The Compose project name scopes its network and database volume. The staging template uses separate database and API ports from the production template. From a POSIX shell (or Git Bash/WSL on Windows):

```sh
cp .env.staging.example .env.staging
# Replace placeholders and ensure POSTGRES_PASSWORD matches DATABASE_URL.
docker compose -p flowstate-staging --env-file .env.staging build api
docker compose -p flowstate-staging --env-file .env.staging up -d postgres
docker compose -p flowstate-staging --env-file .env.staging run --rm api npx prisma migrate deploy
docker compose -p flowstate-staging --env-file .env.staging up -d api
docker compose -p flowstate-staging --env-file .env.staging ps
```

This is a single-machine staging trial, not a deployed staging environment or a production topology. Use a separate project name and an independently managed database for any other environment. The API and database ports bind to loopback by default; put a TLS reverse proxy or load balancer in front when remote access is required. Set `TRUST_PROXY_HOPS` to the actual trusted proxy count.

## Image and database rollout

Build and test an immutable image in CI, scan it, and promote the same image digest through staging to production. Back up the database before schema changes. Run `npx prisma migrate deploy` as a release step with the target database credentials, then roll out the API and verify it. Do not run `prisma migrate dev` in production. The supplied Compose file is intended for isolated trials; a production deployment should use a managed database, platform-managed secrets, TLS ingress, and a deployment platform with controlled rollout and rollback.

## Health checks

`GET /health` checks the database with `SELECT 1`, returning HTTP 200 when the API and database are reachable and HTTP 503 when the database check fails. It is a readiness/dependency check, not an independent liveness probe. Compose polls this endpoint for API container health. Configure the platform's process/container liveness probe separately and alert on sustained readiness failures.

## Logging and monitoring

The application writes timestamped info, warning, and error messages to stdout/stderr. Alert helpers currently write warning messages to the same local logger; they do not deliver notifications. The Compose file limits local container log-file size, but local logs are not durable monitoring or alerting.

Before production, route logs to a centralized service with access control and retention, and configure external alerts for sustained 5xx rates, database/readiness failure, authentication anomalies, disk and connection-pool pressure, and backup-job failures. Add an owner and tested notification path for every alert. No metrics, tracing, external log forwarding, or incident channel is configured by this repository.

## Backups and recovery

The Compose PostgreSQL volume is persistence, not a backup. For production, enable provider-managed point-in-time recovery and encrypted backups in a separate failure domain. Define and approve RPO, RTO, retention, and access ownership; alert on failed or stale backups; and perform scheduled restore drills into an isolated database. Back up before migrations and preserve the encryption keys needed to read encrypted application data separately from database backups.

For a Compose staging database, a custom-format logical backup can be written from a POSIX shell:

```sh
docker compose -p flowstate-staging --env-file .env.staging exec -T postgres \
	sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
	> "flowstate-staging-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Keep the resulting file encrypted and outside the repository. To test recovery, restore it to a separate empty PostgreSQL database using `pg_restore --clean --if-exists --no-owner --no-acl`, then run migrations and application smoke tests against that restored copy. Do not test restore commands against the only copy of production data. On Windows PowerShell, use a binary-safe file redirection method or the PostgreSQL `pg_dump.exe` client; ordinary text pipelines can corrupt a custom-format dump.

## Production release gate

- Deploy to an actual isolated staging service and verify database migrations and critical API flows.
- Replace template values with unique high-entropy environment-specific secrets; confirm no secret is in the image, logs, or source history.
- Connect platform-managed secrets and a managed PostgreSQL service; configure network access and TLS.
- Enable external log retention, metrics/uptime monitoring, and a tested alert destination.
- Enable automated encrypted backups and point-in-time recovery; record RPO/RTO and complete a restore drill.
- Verify health probes, rollback procedure, migration compatibility, and ownership/on-call escalation.
- Run the repository CI checks and live database smoke tests against the release candidate.
