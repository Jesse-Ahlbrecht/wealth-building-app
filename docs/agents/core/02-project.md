# Project: Wealth App

Personal wealth tracker: ingest bank statements, categorize transactions, show saving rate and spending by category. Supports DKB (EUR) and YUH (CHF) statements.

## Stack

- **Backend**: Python/Flask in `backend/`, port **5001**
- **Frontend**: React (JavaScript, no TypeScript) in `frontend/src/`, port **3000**
- **Database**: PostgreSQL, database name `wealth_app`, schema in `backend/schema.sql`

## Run commands

- Full stack: `./run_local.sh` (PostgreSQL, backend, frontend)
- Backend only: `./run_backend.sh`

## Layout

- Backend routes: `backend/routes/`
- DB access: `backend/database.py`
- Auth: `backend/auth.py`, `backend/middleware/`
- React components: `frontend/src/components/`
- Pages: `frontend/src/pages/`
- API client: `frontend/src/api/`
- State: React context in `frontend/src/context/` — no Redux unless asked

## Architecture (current)

- **Frontend-first shaping**: API returns authenticated user data; filtering and aggregation happen in the React SPA
- **Flask routes** orchestrate parsers and DB access; keep parsing helpers pure where possible
- Session auth uses encrypted tokens in httpOnly cookies (see security section)

## Agent docs source

Edit `docs/agents/` only — not generated `AGENTS.md` or rule outputs. Run `./scripts/sync-agent-docs.sh` after changes.

## Skills

| Skill | Use when |
| ----- | -------- |
| `run-app` | Starting backend and/or frontend |
| `db-inspect` | Querying PostgreSQL |
| `run-tests` | Running backend tests |
| `tail-logs` | Checking backend process/logs |
