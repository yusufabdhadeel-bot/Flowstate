# Flowstate Enterprise Workflow Platform

Flowstate is an enterprise workflow and operations platform built with Node.js, TypeScript, Prisma, and PostgreSQL. The product scope is broader than a simple org chart: it includes organization management, department hierarchies, memo approval workflows, AI-assisted classification, notifications, reporting, security monitoring, and tenant-aware governance.

## Product scope

- organization and department structure
- employee hierarchy and manager assignment
- memo workflow approval and tracking
- automation rules and notifications
- AI classification and summarization
- tenant-aware security boundaries and sessions
- compliance and enterprise operations tooling

## Local setup

1. Copy `.env.example` to `.env` and set the required values.
2. Install dependencies with `npm install`.
3. Start PostgreSQL.
4. Prepare the isolated test database with `npm run test:prepare`.
5. Start the API with `npm run dev`.

## Deployment status

The repository includes a Docker image and Compose configuration for local use and an isolated staging trial:

- `Dockerfile`
- `docker-compose.yml`
- `.env.production.example`
- `docs/DEPLOYMENT.md`

These artifacts do not configure a production platform, external secret manager, monitoring destination, or database backups. Review [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the operations runbook and production release gates before deploying.

## Verification

Run the real checks before release:

```bash
npm run test:prepare
npm test
npm run typecheck
npm run build
```

## API highlights

- `GET /health` - readiness and database connectivity
- `POST /auth/login` - secure login flow
- `POST /users` - create users
- `PATCH /users/:id/assign-manager` - assign manager relationships
- `GET /memos` and workflow endpoints - memo and approval processing
- compliance and security routes - enterprise monitoring and governance

## Notes

- The project is designed for multi-tenant enterprise workflows.
- Secret values must be injected securely for production.
- `/health` is a database-backed readiness check; configure a separate process liveness probe in the hosting platform.
