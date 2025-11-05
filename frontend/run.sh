#!/bin/bash

# Check if port 3000 is already in use and kill existing process
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
    echo "🛑 Killing existing React frontend server..."
    EXISTING_PID=$(lsof -Pi :3000 -sTCP:LISTEN -t)
    kill $EXISTING_PID 2>/dev/null
    sleep 2  # Wait for process to fully terminate
fi

echo "🌐 Starting React frontend on http://localhost:3000"
npm start
