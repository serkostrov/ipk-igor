#!/bin/sh
# Inject VITE_* into the SPA at container start (Dokploy Environment works —
# Vite cannot read runtime env from an already-built nginx image).
set -eu

ENV_JS=/usr/share/nginx/html/env.js
URL="${VITE_SUPABASE_URL:-}"
KEY="${VITE_SUPABASE_ANON_KEY:-}"

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set." >&2
  echo "In Dokploy: Environment (or Build Arguments) — both are read at container start." >&2
  exit 1
fi

escape_js() {
  # Escape \, ", and newlines for a double-quoted JS string.
  printf '%s' "$1" | awk 'BEGIN{ORS=""} {
    gsub(/\\/, "\\\\")
    gsub(/"/, "\\\"")
    gsub(/\r/, "\\r")
    gsub(/\n/, "\\n")
    print
  }'
}

cat >"$ENV_JS" <<EOF
window.__IPK_ENV__={
  "VITE_SUPABASE_URL":"$(escape_js "$URL")",
  "VITE_SUPABASE_ANON_KEY":"$(escape_js "$KEY")"
};
EOF

exec nginx -g "daemon off;"
