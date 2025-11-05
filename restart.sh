#!/bin/bash

# Quick restart script for Wealth App

echo "🛑 Stopping services..."
pkill -f "python.*app.py"
pkill -f "node.*react-scripts"
sleep 2

echo "🚀 Starting Backend..."
cd "$(dirname "$0")/backend"
python app.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend started (PID: $BACKEND_PID)"

echo "🚀 Starting Frontend..."
cd ../frontend
npm start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "✅ Services restarted!"
echo "📊 Backend:  http://localhost:5001 (logs: /tmp/backend.log)"
echo "🖥️  Frontend: http://localhost:3000 (logs: /tmp/frontend.log)"
echo ""
echo "To view logs:"
echo "  tail -f /tmp/backend.log"
echo "  tail -f /tmp/frontend.log"

