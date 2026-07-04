#!/bin/bash

# Wealth Management App - Local Development Startup Script

echo "🚀 Starting Wealth Management App (Local Development)"

# Check if PostgreSQL is running
if ! pgrep -x "postgres" > /dev/null; then
    echo "⚠️  PostgreSQL not running. Starting PostgreSQL..."
    brew services start postgresql@14
    sleep 3
fi

# Check if database exists
if ! psql -lqt | cut -d \| -f 1 | grep -qw wealth_app; then
    echo "📦 Creating wealth_app database..."
    createdb wealth_app
    echo "🏗️  Setting up database schema..."
    psql -d wealth_app -f backend/schema.sql
fi

# Start the Flask backend
echo "🖥️  Starting Flask backend on http://localhost:5001"
cd backend
export FLASK_ENV=development
./venv/bin/python app.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start the React frontend (kill existing and restart if running)
if [ -d "../frontend" ]; then
    # Check if port 3000 is already in use and kill existing process
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
        echo "🛑 Killing existing React frontend server..."
        EXISTING_PID=$(lsof -Pi :3000 -sTCP:LISTEN -t)
        kill $EXISTING_PID 2>/dev/null
        sleep 2  # Wait for process to fully terminate
    fi

    echo "🌐 Starting React frontend on http://localhost:3000"
    cd ../frontend
    npm start &
    FRONTEND_PID=$!
fi

echo ""
echo "✅ Wealth App is running!"
echo "📊 Backend API: http://localhost:5001"
echo "🖥️  Frontend:    http://localhost:3000 (if available)"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
cleanup() {
    echo '🛑 Stopping services...'
    kill $BACKEND_PID 2>/dev/null
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo "Stopped React frontend (PID: $FRONTEND_PID)"
    else
        echo "React frontend was already running - not stopping it"
    fi
    exit
}

trap cleanup INT
wait
