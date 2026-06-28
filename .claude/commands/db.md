Inspect the PostgreSQL database. The database is named `wealth_app`. Use `psql -d wealth_app` for interactive queries. Schema is in `backend/schema.sql`. Useful queries:
- List tables: `psql -d wealth_app -c "\dt"`
- Check tenants: `psql -d wealth_app -c "SELECT * FROM tenants;"`
- Check transactions: `psql -d wealth_app -c "SELECT COUNT(*) FROM transactions;"`
- Describe a table: `psql -d wealth_app -c "\d <table_name>"`

All data is tenant-scoped — always filter by tenant_id in queries.
