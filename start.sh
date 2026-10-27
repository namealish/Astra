#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node server.mjs
else
  python3 -m http.server 5173
fi
