#!/bin/bash
# 啟動前端 + 後端，自動清理殘留 process

BUN=/Users/gomigo/.bun/bin/bun
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🧹 清理舊 process..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 0.5

echo "🚀 啟動 backend (port 3001)..."
cd "$ROOT/04-server"
$BUN run --env-file="$ROOT/.env" src/index.ts &
BACKEND_PID=$!

echo "🚀 啟動 frontend (port 5173)..."
cd "$ROOT/02-web"
$BUN run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 已啟動"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止所有服務"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
