# Security (implemented today)

Tenant scoping is enforced in the rules section below.

## Auth

- Handled in `backend/auth.py` and `backend/middleware/`
- Session tokens in **httpOnly cookies** — do not move to localStorage
- Tokens use PASETO-style encrypted payloads (AES-GCM) — see `auth.py`
- Secrets from env: `WEALTH_SECRET_KEY`, `WEALTH_HMAC_SECRET` via `backend/config.py`

## CORS

Configured in `backend/app.py`. Do not change allowed origins without understanding the prod/dev split.

## Secrets

No secrets in git. Local dev uses env files that are gitignored.

Future-state encryption/KMS/hosting details are in `wealth.plan.md` — not required for current local development.
