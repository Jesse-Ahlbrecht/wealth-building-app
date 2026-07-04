---
name: tail-logs
description: Check whether the Flask backend is running and find its logs. Use when debugging server issues or startup failures.
---

Backend runs via `python app.py` from `backend/` on port 5001.

```bash
lsof -i :5001
ps aux | grep app.py
```

If not running, suggest `./run_backend.sh`. Check stdout from the run script or `backend/logs/` if present.
