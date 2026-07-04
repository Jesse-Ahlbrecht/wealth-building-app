---
name: run-tests
description: Run backend tests or syntax checks. Use before finishing backend changes or when the user asks to test.
---

Test files are in `backend/` (e.g. `backend/test_settings.py`).

```bash
cd backend && python -m pytest          # if pytest installed
cd backend && python test_settings.py # direct run
cd backend && python -m py_compile app.py database.py
```

If no tests exist for the area being changed, note that and offer to write them.
