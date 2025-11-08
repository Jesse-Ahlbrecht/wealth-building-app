#!/bin/bash

# Kill any process using port 5001
echo "Checking for existing processes on port 5001..."
lsof -ti:5001 | while read -r PID; do
    if [ ! -z "$PID" ]; then
        echo "  Killing process $PID..."
        kill -9 $PID 2>/dev/null || true
    fi
done

# Wait a bit for the port to be released
sleep 2

# Check if port is now free
if lsof -ti:5001 > /dev/null 2>&1; then
    echo "ERROR: Port 5001 is still in use!"
    echo "Active processes:"
    lsof -i:5001
    exit 1
else
    echo "Port 5001 is now free."
fi

# Clean up old encrypted files that can't be decrypted with new random keys (dev mode)
# In production, these files would persist because you'd use a fixed encryption key
echo "Cleaning old encrypted cache files..."
rm -f custom_categories.enc manual_overrides.enc

# Start the Flask server
source venv/bin/activate
export FLASK_ENV=development
export FLASK_DEBUG=1
python app.py
