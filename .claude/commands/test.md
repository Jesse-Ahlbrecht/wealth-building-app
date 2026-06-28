Run backend tests. Test files are in `backend/` — currently `backend/test_settings.py` exists. Run with:
- `cd backend && python -m pytest` (if pytest installed)
- `cd backend && python test_settings.py` for direct run
- `cd backend && python -m py_compile app.py database.py` for syntax check

If no tests exist for the area being changed, note that and offer to write them before implementing.
