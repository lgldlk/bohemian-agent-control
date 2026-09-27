#!/bin/bash

# 🚀 启动所有开发服务
# Usage: ./scripts/dev-all.sh

MAGENTA='\033[1;35m'
CYAN='\033[1;36m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${MAGENTA}██████╗  ██████╗ ██╗  ██╗███████╗███╗   ███╗██╗ █████╗ ███╗   ██╗${NC}"
echo -e "${MAGENTA}██╔══██╗██╔═══██╗██║  ██║██╔════╝████╗ ████║██║██╔══██╗████╗  ██║${NC}"
echo -e "${MAGENTA}██████╔╝██║   ██║███████║█████╗  ██╔████╔██║██║███████║██╔██╗ ██║${NC}"
echo -e "${MAGENTA}██╔══██╗██║   ██║██╔══██║██╔══╝  ██║╚██╔╝██║██║██╔══██║██║╚██╗██║${NC}"
echo -e "${MAGENTA}██████╔╝╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║██║  ██║██║ ╚████║${NC}"
echo -e "${MAGENTA}╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝${NC}"
echo -e "${CYAN}    ___   _____________   ________   __________  _   ____________  ____  __ ${NC}"
echo -e "${CYAN}   /   | / ____/ ____/ | / /_  __/  / ____/ __ \\/ | / /_  __/ __ \\/ __ \\/ / ${NC}"
echo -e "${CYAN}  / /| |/ / __/ __/ /  |/ / / /    / /   / / / /  |/ / / / / /_/ / / / / /  ${NC}"
echo -e "${CYAN} / ___ / /_/ / /___/ /|  / / /    / /___/ /_/ / /|  / / / / _, _/ /_/ / /___${NC}"
echo -e "${CYAN}/_/  |_\\____/_____/_/ |_/ /_/     \\____/\\____/_/ |_/ /_/ /_/ |_|\\____/_____${NC}"
echo ""
echo -e "${DIM}  One canvas, every agent. — \"Man is born free.\"${NC}"
echo ""
echo "Services:"
echo "  - Frontend:  http://localhost:18720"
echo "  - API:       http://localhost:18721"
echo "  - Terminal:  ws://localhost:18722"
echo ""

# 根项目的 dev 脚本统一编排前端、API 和 Terminal 服务。
# 不要递归执行 workspace dev，否则会重复启动 API / Terminal 并造成端口冲突。
exec pnpm dev
