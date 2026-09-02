#!/bin/sh
set -e

PLACEHOLDER_URL="https://__AGORA_SUPABASE_URL_PLACEHOLDER__"
PLACEHOLDER_URL_LC="https://__agora_supabase_url_placeholder__"
PLACEHOLDER_KEY="__AGORA_SUPABASE_ANON_KEY_PLACEHOLDER__"

replace_in_build() {
  find /app/.next \( -name '*.js' -o -name '*.html' -o -name '*.json' \) -print0 2>/dev/null \
    | xargs -0 -r sed -i "$@"
}

if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ "$NEXT_PUBLIC_SUPABASE_URL" != "$PLACEHOLDER_URL" ]; then
  echo "entrypoint: replacing NEXT_PUBLIC_SUPABASE_URL placeholder..."
  HOST="${NEXT_PUBLIC_SUPABASE_URL#https://}"
  HOST="${HOST#http://}"
  replace_in_build \
    -e "s|${PLACEHOLDER_URL}|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|${PLACEHOLDER_URL_LC}|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|wss://__agora_supabase_url_placeholder__|wss://${HOST}|g" \
    -e "s|ws://__agora_supabase_url_placeholder__|ws://${HOST}|g" \
    -e "s|wss://__AGORA_SUPABASE_URL_PLACEHOLDER__|wss://${HOST}|g" \
    -e "s|ws://__AGORA_SUPABASE_URL_PLACEHOLDER__|ws://${HOST}|g"
fi

if [ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && [ "$NEXT_PUBLIC_SUPABASE_ANON_KEY" != "$PLACEHOLDER_KEY" ]; then
  echo "entrypoint: replacing NEXT_PUBLIC_SUPABASE_ANON_KEY placeholder..."
  replace_in_build -e "s|${PLACEHOLDER_KEY}|${NEXT_PUBLIC_SUPABASE_ANON_KEY}|g"
fi

exec "$@"
