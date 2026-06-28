# CLAUDE.md

## 1. Think Before Coding

Before implementing: state assumptions explicitly, ask if uncertain. Present multiple interpretations — dont pick silently. Say if simpler approach exists. If unclear, stop and ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked
- No abstractions for single-use code
- No unrequested flexibility or configurability
- No error handling for impossible scenarios
- If 200 lines could be 50, rewrite it

Ask: "Would a senior engineer call this overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Dont improve adjacent code, comments, or formatting
- Dont refactor things that arent broken
- Match existing style even if youd do it differently
- Notice unrelated dead code? Mention it, dont delete it
- Remove imports/vars/functions YOUR changes made unused
- Every changed line should trace to the users request

## 4. Goal-Driven Execution

Transform tasks into verifiable goals. For multi-step tasks, state a brief plan:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
```

"Fix the bug" → write a test that reproduces it, then make it pass. Loop until verified.

## 5. Code Style

- No comments unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- No docstrings or multi-line comment blocks
- No trailing summaries in responses — user can read the diff
- Short, concise responses

## Project: Wealth App

- Backend: Python/Flask in `backend/`, runs on port 5001
- Frontend: React in `frontend/src/`, runs on port 3000
- DB: PostgreSQL (`wealth_app` database), schema in `backend/schema.sql`
- Run backend only: `./run_backend.sh`
- Run full stack: `./run_local.sh`

### Tenant Scoping (critical)

Every DB query MUST be scoped to a tenant. The `database.py` sets tenant context via `set_tenant_context(tenant_id)`. Never query transactions, accounts, or user data without filtering by `tenant_id`. Missing tenant scope = data leak across users.

### Auth & CORS

- Auth is handled in `backend/auth.py` and `backend/middleware/`
- CORS is configured in `backend/app.py` — dont change allowed origins without understanding the prod/dev split
- Session tokens live in httpOnly cookies — dont move them to localStorage
- `backend/config.py` reads `WEALTH_SECRET_KEY` and `WEALTH_HMAC_SECRET` from env

### Frontend Stack

- React (no TypeScript), component files in `frontend/src/components/`
- Pages in `frontend/src/pages/`, API calls in `frontend/src/api/`
- State via React context (`frontend/src/context/`)
- No Redux, no external state lib — keep it that way unless asked
