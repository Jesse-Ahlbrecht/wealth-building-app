---
name: run-app
description: Start or restart the wealth app backend and/or frontend. Use when running the app locally, or after code changes so updates are visible for review.
---

Start or restart the wealth app so changes are live for browser review.

- Full stack: `./run_local.sh` — backend on port 5001, frontend on port 3000
- Backend only: `./run_backend.sh`
- Frontend only: `cd frontend && npm start`

Both stack scripts handle PostgreSQL startup and DB creation.

## After making changes

Restart the service you touched — Flask does not auto-reload in this setup; React may hot-reload but a restart is safer after substantive edits.

| Changed | Restart |
| ------- | ------- |
| `backend/` | `./run_backend.sh` (kills port 5001 first if already running) |
| `frontend/` | `npm start` in `frontend/` (kills port 3000 first if needed) |
| Both | `./run_local.sh` or restart each |

Quick restart backend:

```bash
kill $(lsof -t -i :5001) 2>/dev/null; sleep 1; ./run_backend.sh
```

Confirm services are reachable: `lsof -i :5001`, `lsof -i :3000`.
