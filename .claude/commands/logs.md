Tail the Flask backend logs. The backend runs via `python app.py` from the `backend/` directory on port 5001. To see live output, check if the process is running first:
- `lsof -i :5001` to confirm backend is up
- `ps aux | grep app.py` to find the process
- If logging to a file, check `backend/logs/` or stdout of the run script

If backend isnt running, suggest `./run_backend.sh`.
