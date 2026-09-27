#!/bin/bash
cd "$(dirname "$0")"
WEB_PORT=18720
API_PORT=18721
TERMINAL_PORT=18722

for p in $WEB_PORT $API_PORT $TERMINAL_PORT; do
  if lsof -Pi :$p -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "stopping old process on $p..."
    kill -9 $(lsof -t -i:$p) 2>/dev/null
  fi
done
sleep 1

echo "starting vite + api + terminal in background..."
nohup pnpm dev > dev.log 2>&1 &
echo "pid: $!"
echo "logs: tail -f dev.log"
sleep 4
tail -15 dev.log
echo ""
echo "open http://localhost:$WEB_PORT"
