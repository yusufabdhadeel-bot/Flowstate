# Staging Deployment Checklist

Status date: 2026-10-01
Current deployment status: BLOCKED; no staging container has been started.

## Assessment

- [PASS] Compose defines separate API and PostgreSQL services, project-scoped networking/storage, and staging ports 4400/5433 bound to loopback.
- [PASS] PostgreSQL healthcheck uses configured `POSTGRES_USER` and `POSTGRES_DB`; API healthcheck polls `/health`.
- [PASS] Staging template uses an isolated database name/user and `REPLACE_ME` sentinels for JWT and MFA secrets.
- [PASS] Dockerfile runs the API as the non-root `node` user.
- [FAIL] A live staging deployment is not running; no containers or staging endpoint exist to verify.
- [BLOCKED] Runtime `.env.staging` does not exist; no actual staging credentials were supplied.
- [BLOCKED] Docker CLI/Compose and engine are unavailable in the current environment. YAML/Compose parsing, image build, and container startup could not be run.
- [BLOCKED] Migrations, container health, API smoke tests, and staging isolation have not been verified against a live Compose deployment.
- [BLOCKED] No external TLS endpoint, monitoring integration, or backup system is attached to this local Compose trial.

## Operator prerequisites

- Install/start Docker Desktop (or another Docker Engine with Compose v2) on the staging host.
- Provision staging-only PostgreSQL, database, and application credentials. Do not reuse production values.
- Generate unique high-entropy `POSTGRES_PASSWORD`, `JWT_SECRET`, and `MFA_ENCRYPTION_KEY` values using the organization's approved secret manager. The JWT and MFA values must satisfy the application's 32-character minimum; never use the template sentinels.
- Set `POSTGRES_PASSWORD` and the password in `DATABASE_URL` to the same value. Use a URL-safe password or percent-encode reserved characters in the URL.
- Set the real staging `CORS_ALLOWED_ORIGINS` and trusted proxy hop count. Do not expose the loopback-bound ports directly to the internet.

## Deployment and smoke test

Run from the repository root in PowerShell after completing prerequisites:

```powershell
Copy-Item .env.staging.example .env.staging
# Populate .env.staging from the approved staging secret source; do not commit it.

docker compose -p flowstate-staging --env-file .env.staging config --quiet
docker compose -p flowstate-staging --env-file .env.staging build api
docker compose -p flowstate-staging --env-file .env.staging up -d postgres
docker compose -p flowstate-staging --env-file .env.staging run --rm api npx prisma migrate deploy
docker compose -p flowstate-staging --env-file .env.staging up -d api
docker compose -p flowstate-staging --env-file .env.staging ps
Invoke-RestMethod http://127.0.0.1:4400/health
```

Require both containers to report healthy and the API health response to report `status = ok` and `checks.database = ok`. Run the agreed staging auth, tenant-isolation, and critical workflow smoke tests. Confirm logs contain no secrets, the service is reachable only through the intended ingress, and staging uses no production database or credentials. Record the image digest, migration result, test evidence, owner, and rollback procedure before marking deployment PASS.

## Gate result

Do not proceed to monitoring integration, backup/restore drill, security smoke test, or production gate until the live staging checks above pass. This checklist does not assert that staging is deployed; update the blocked items only with observed evidence.
