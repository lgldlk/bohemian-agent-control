#!/bin/bash
for p in 18720 18721 18722; do
  if lsof -Pi :$p -sTCP:LISTEN -t >/dev/null 2>&1; then
    kill -9 $(lsof -t -i:$p) 2>/dev/null
  fi
done
pkill -f "tsx watch src/index.ts" 2>/dev/null
pkill -f "tsx watch src/cli.ts" 2>/dev/null
echo "stopped"
