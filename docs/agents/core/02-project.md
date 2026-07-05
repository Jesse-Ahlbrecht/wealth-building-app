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
- Categorizer: `backend/services/categorizer.py`, rules in `backend/categories_*.json`
- Backfill scripts: `scripts/recategorize_*.py`
- React components: `frontend/src/components/`
- Pages: `frontend/src/pages/`
- API client: `frontend/src/api/`
- State: React context in `frontend/src/context/` — no Redux unless asked

## Architecture (current)

- **Frontend-first shaping**: API returns authenticated user data; filtering and aggregation happen in the React SPA
- **Flask routes** orchestrate parsers and DB access; keep parsing helpers pure where possible
- Session auth uses encrypted tokens in httpOnly cookies (see security section)

## Categorization backfill

Category/merchant/bank-map edits do **not** update existing transactions automatically.

After changing categorization rules, run the appropriate script (default tenant: `local-dev`):

| Script | When |
| ------ | ---- |
| `scripts/recategorize_other_transactions.py` | New keywords for `Other` / legacy `Transfer` |
| `scripts/recategorize_transport_transactions.py` | Re-evaluate `Transport` (e.g. new Vacation category) |
| `scripts/recategorize_ibkr_transactions.py` | IBKR counterparty keyword fixes |

```bash
./backend/venv/bin/python scripts/recategorize_transport_transactions.py --tenant local-dev --dry-run
./backend/venv/bin/python scripts/recategorize_transport_transactions.py --tenant local-dev
```

Add a new `scripts/recategorize_*.py` when no existing script covers the source category. Then restart the backend.

## Agent docs source

Edit `docs/agents/` only — not generated `AGENTS.md` or rule outputs. Run `./scripts/sync-agent-docs.sh` after changes.

## Skills

| Skill | Use when |
| ----- | -------- |
| `run-app` | Starting backend and/or frontend |
| `db-inspect` | Querying PostgreSQL |
| `run-tests` | Running backend tests |
| `tail-logs` | Checking backend process/logs |
