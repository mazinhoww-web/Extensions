#!/bin/bash
# apply-migrations.sh
# Applies all Supabase migrations to the remote project via Management API
# Usage: bash apply-migrations.sh

PROJECT_REF="smdjuguokqaughesldit"
ACCESS_TOKEN="sbp_029498384465688f48bee7b7e45ee57bf0c92cce"
API_URL="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

run_sql() {
  local file="$1"
  local name="$2"
  echo "▶ Applying: ${name}..."
  local sql
  sql=$(cat "$file")
  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg q "$sql" '{"query":$q}')")
  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | head -n -1)
  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo "  ✓ ${name} applied"
  else
    echo "  ✗ ${name} failed (HTTP ${http_code})"
    echo "  Response: ${body}"
    exit 1
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/migrations"

run_sql "${SCRIPT_DIR}/001_create_users.sql"    "001 users"
run_sql "${SCRIPT_DIR}/002_create_usage.sql"    "002 usage"
run_sql "${SCRIPT_DIR}/003_create_meetings.sql" "003 meetings + transcripts"
run_sql "${SCRIPT_DIR}/004_create_teams.sql"    "004 teams"
run_sql "${SCRIPT_DIR}/005_rls_policies.sql"    "005 RLS policies"

echo ""
echo "✅ All migrations applied to project ${PROJECT_REF}"
