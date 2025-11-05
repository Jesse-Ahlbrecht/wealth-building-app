#!/bin/bash

# Wealth Management App - Backend Only Startup Script

echo "🖥️  Starting Wealth Management App Backend (Local Development)"

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
python app.py &
BACKEND_PID=$!

echo ""
echo "✅ Backend is running!"
echo "📊 Backend API: http://localhost:5001"
echo ""
echo "Press Ctrl+C to stop the backend"

# Wait for interrupt
trap "echo '🛑 Stopping backend...'; kill $BACKEND_PID 2>/dev/null; exit" INT
wait
