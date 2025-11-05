# Hosting & Philosophy Plan

1. Summarize a cloud VM deployment approach optimized for speed and AES-256 security, covering OS hardening, reverse proxy choice, database storage, and key management.
2. Recommend AES-256 implementation patterns for full-database protection of bank statements, including at-rest and in-transit safeguards.
3. Capture frontend-first development philosophy, coding standards, and security practices in a new `agent.md` artifact for the project.

### To-dos

- [x] Outline the secure cloud VM architecture with performance and AES-256 considerations
- [x] Detail AES-256 data-at-rest pattern for whole database and sensitive files
- [x] Write project code philosophies and practices into agent.md

## Cloud VM Hosting Blueprint

- **Footprint**: Single Ubuntu Server 24.04 LTS VM (4 vCPU / 8 GB RAM) in a hardened VPC/subnet. Attach separate NVMe volumes for the OS and an encrypted data disk that stores PostgreSQL data and encrypted statement blobs. Security groups default-deny; only 22 (IP-restricted), 80/443 (reverse proxy), and 5432 (database, VPC-only) remain open.
- **OS Hardening & Updates**: Apply CIS Ubuntu baseline, disable password SSH in favor of hardware-backed keys, enforce automatic security updates, and configure `ufw` + `fail2ban` for SSH and HTTP(s). Enable auditd for privileged command auditing.
- **Runtime Layout**: Serve the React SPA via `nginx` (HTTP/2, Brotli, immutable caching). Run the Flask API behind `gunicorn` managed by `systemd`. Configure zero-downtime deploys with blue/green service units and health-checked reverse proxy upstreams.
- **Database Tier**: Deploy PostgreSQL 16 on the encrypted data volume. Enable TLS (`hostssl`) with modern cipher suites, `pgcrypto` for AES-256-GCM column encryption, logical decoding for PITR, and row-level security (per user). Keep the database on a private subnet; only the backend security group can connect.
- **Secrets & Keys**: Store credentials and encryption keys in cloud KMS (AWS KMS/Azure Key Vault/GCP KMS). Bootstrap via instance metadata/managed identity so no static secrets live on disk. Cache decrypted keys in-memory with periodic rotation and write audit hooks for every key access.
- **Observability & Resilience**: Ship structured logs via `fluent-bit` to a managed log service, emit metrics to Prometheus/Grafana or cloud-native equivalents, and configure encrypted nightly backups to object storage with lifecycle policies. Add uptime checks and IaC (Terraform/Ansible) for repeatable rebuilds.
- **Frontend-First Delivery**: Backend returns user-scoped datasets in bulk after authz; the frontend filters/aggregates locally. Responses are signed so the client can verify integrity before use, and paging is handled client-side to keep API latency low.

## AES-256 Data Protection Strategy

- **At-Rest Encryption (Database)**: Store transactional tables in PostgreSQL with `pgcrypto`. Wrap inserts/updates via stored procedures that call `pgp_sym_encrypt` (AES-256) with per-tenant data encryption keys (DEKs). Expose decrypted views only to authenticated sessions; row-level security ensures each request sees its own tenant rows.
- **At-Rest Encryption (Files)**: Encrypt bank statement CSV/PDF assets client-side before upload using Python `cryptography.hazmat.primitives.ciphers.aead.AESGCM`. Persist ciphertext + nonce to S3-compatible object storage with server-side AES-256 turned on as a secondary layer. Metadata (hash, key version) lands in PostgreSQL.
- **Key Lifecycle**: Generate unique 256-bit DEKs per tenant or per dataset. Wrap DEKs with a KMS-managed master key (KEK). Rotate KEKs quarterly, DEKs annually or immediately upon incident. Keep version history so data can be re-encrypted without downtime.
- **In-Transit Safeguards**: Enforce TLS 1.3 with HSTS and OCSP stapling at `nginx`. Use mutual TLS or WireGuard for administrative database access. Issue short-lived JWTs with PASETO payload encryption for API calls and pin backend certificates in the frontend app.
- **Frontend Handling**: When delivering the full dataset to the SPA, sign payloads with an HMAC (SHA-256) derived from the session key. If the browser caches data (IndexedDB), re-encrypt locally using Web Crypto AES-GCM with a key derived from the session token to guard against compromised storage.
- **Compliance & Monitoring**: Centralize key access logs, configure SIEM alerts for anomalous decrypt calls, and document runbooks for key rotation, compromise response, and breach notification timelines.

