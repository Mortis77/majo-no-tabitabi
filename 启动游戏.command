#!/bin/bash
# 魔女之旅 — 在浏览器里启动（需要先构建：node build.mjs --release）。固定端口，存档才会一直在。
cd "$(dirname "$0")/dist" 2>/dev/null || { echo "还没有构建：请先在项目目录运行  node build.mjs --release"; read -r -p "按回车关闭"; exit 1; }
PORT=47327
( sleep 1; open "http://127.0.0.1:$PORT/" ) &
echo "魔女之旅 正在 http://127.0.0.1:$PORT/ 运行。关闭这个窗口即可停止。"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
