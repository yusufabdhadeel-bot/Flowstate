# Flowstate User Hierarchy Service

A Node.js + TypeScript + Prisma + PostgreSQL service for managing a user org chart.

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Run `npm install`.
3. Run `npx prisma generate`.
4. Run `npx prisma migrate dev --name init`.
5. Seed sample data with `npm run prisma:seed`.
6. Start the API with `npm run dev`.

## API Endpoints

- `POST /users` - create a user
- `GET /users/:id` - get user by id
- `PATCH /users/:id/assign-manager` - assign a manager
- `GET /users/:id/manager` - get direct manager
- `GET /users/:id/direct-reports` - get direct reports
- `GET /users/:id/hierarchy` - get chain to top-level

## Production migration

Use `npm run prisma:migrate:prod` in production environments to apply existing Prisma migrations without interactive prompts.

## Notes

- The Prisma schema indexes `reportsTo` and enforces `reportsTo IS NULL OR reportsTo <> id`.
- The service layer prevents self-reporting and circular hierarchies.
