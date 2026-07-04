---
name: db-inspect
description: Inspect the PostgreSQL wealth_app database. Use when querying schema, tenants, transactions, or debugging data issues.
---

Database name: `wealth_app`. Schema: `backend/schema.sql`.

```bash
psql -d wealth_app -c "\dt"
psql -d wealth_app -c "SELECT * FROM tenants;"
psql -d wealth_app -c "SELECT COUNT(*) FROM transactions;"
psql -d wealth_app -c "\d <table_name>"
```

All data is tenant-scoped — always filter by `tenant_id` in queries.
