---
name: run-app
description: Start the wealth app backend and/or frontend. Use when the user wants to run, start, or launch the application locally.
---

Start the wealth app.

- Full stack: `./run_local.sh` — backend on port 5001, frontend on port 3000
- Backend only: `./run_backend.sh`

Both scripts handle PostgreSQL startup and DB creation. After starting, confirm services are reachable (`lsof -i :5001`, `lsof -i :3000`).
