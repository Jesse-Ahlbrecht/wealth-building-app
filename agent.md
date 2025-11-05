# Agent Coding Philosophy

## Mission & Scope

We are building a personal wealth management tool that ingests sensitive banking statements, normalizes them, and delivers a responsive, frontend-first experience. Every design decision prioritizes confidentiality, integrity, and speed while keeping the deployment lightweight enough to run on a hardened single-VM footprint.

## Architectural Principles

- **Frontend-first data shaping**: After the API authenticates and authorizes a request, it returns the user’s full data domain (transactions, accounts, projections). Filtering, aggregation, and visualization happen in the React SPA using memoized selectors to keep latency low.
- **Zero implicit trust**: Treat every boundary–browser, API, database, object storage–as hostile by default. Enforce explicit authn/authz, signed payloads, and double encryption (client + server) for statement artifacts.
- **Stateless API surface**: Flask endpoints remain idempotent and stateless aside from encrypted storage operations. Session affinity lives in short-lived JWT/PASETO tokens validated per call.
- **Separation of concerns**: Keep ingestion/parsing helpers pure and testable. Route functions should orchestrate parsers, encryption helpers, and response formatters without embedding business logic.

## Security & Data Handling

- **Encryption**: AES-256 everywhere—`pgcrypto` for columnar data, AES-GCM for file blobs, and HMAC signatures on API payloads. Keys originate from cloud KMS, never from environment files.
- **Key rotation**: Expose helper utilities to rotate DEKs/KEKs without downtime. Application code must be resilient to key version mismatches by looking up the active key before decrypt operations.
- **Secrets hygiene**: No secrets in git. Use instance metadata/managed identities for runtime credential retrieval. When developing locally, store secrets in `.env.local` that is explicitly git-ignored.
- **Least privilege**: Backend IAM role can read specific prefixes in object storage and manage only the database targeted schemas. Frontend uses per-user scoped tokens; never expose global identifiers to the browser.

## Coding Standards

- **Backend (Python/Flask)**
  - Type hint all public functions, run `mypy` in strict mode for new modules.
  - Use dependency injection for services (encryption, storage, database) to keep tests deterministic.
  - Log with structured JSON (request id, user id, correlation id) and avoid logging PII.
  - Enforce lint via `ruff` and formatting via `black` (line length 100) before commit.
- **Frontend (React)**
  - Keep components presentational; move data shaping into hooks/selectors.
  - Prefer React Query for data fetching/caching; the API returns cache-friendly ETags.
  - Use TypeScript definitions generated from the OpenAPI spec to stay in sync with the backend.
  - Sanitize and escape all user-visible fields; never trust data even after decryption.

## Testing & Quality Gates

- **Unit tests**: Cover parsers, encryption utilities, and API contracts. Mock KMS interactions to avoid leaking real keys.
- **Integration tests**: Spin up a disposable Postgres container with `pgcrypto` enabled; run ingestion flows end-to-end using fixture statements.
- **Security tests**: Include dependency scanning (pip-audit, npm audit) and automated SAST (Bandit, Semgrep). Plan for periodic threat modeling sessions and tabletop exercises for key compromise.
- **Performance checks**: Profile the frontend bundle (Lighthouse target ≥ 90) and API latency (p95 < 200 ms for typical dataset). Ensure AES operations are hardware-accelerated (AES-NI/GCM).

## Operational Playbook

- **Deployments**: Deliver via CI/CD pipeline that builds immutable artifacts, runs the full test suite, and deploys with canary checks behind nginx health probes.
- **Observability**: Emit metrics for ingestion success, encryption/decryption failures, and frontend hydration timing. Alert on anomalous decrypt counts or large payload downloads.
- **Incident response**: Maintain runbooks for data corruption, key compromise, and unexpected client desync. First steps always rotate keys, snapshot the database, and isolate the VM.

This document is the authoritative guide for contributors and automation agents. Keep it updated whenever architecture, security posture, or coding standards evolve.

