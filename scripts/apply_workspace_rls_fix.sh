#!/bin/bash

# Apply Workspace Collaboration RLS Fix
# This script applies the comprehensive RLS fix for workspace collaboration tables

set -e  # Exit on error

echo ""
echo "================================================================"
echo "🔧 Workspace Collaboration RLS Fix"
echo "================================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set your database connection string:"
    echo ""
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
    echo ""
    echo "Or if using Supabase, you can find it in:"
    echo "  Dashboard → Project Settings → Database → Connection string"
    echo ""
    exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ ERROR: psql command not found"
    echo ""
    echo "Please install PostgreSQL client:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql-client"
    echo ""
    exit 1
fi

echo "✅ psql is available"
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SQL_FILE="$SCRIPT_DIR/fix_workspace_collaboration_rls.sql"

# Check if the SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ ERROR: SQL file not found at $SQL_FILE"
    exit 1
fi

echo "✅ SQL file found"
echo ""
echo "📝 About to apply fix to:"
echo "   - workspace_comments"
echo "   - workspace_notes"
echo "   - workspace_activity"
echo "   - workspace_items"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted by user"
    exit 1
fi

echo ""
echo "🚀 Applying fix..."
echo ""

# Apply the SQL file
if psql "$DATABASE_URL" -f "$SQL_FILE"; then
    echo ""
    echo "================================================================"
    echo "✅ SUCCESS - Fix applied successfully!"
    echo "================================================================"
    echo ""
    echo "Next steps:"
    echo "  1. Refresh your browser (Cmd+Shift+R or Ctrl+Shift+R)"
    echo "  2. Navigate to a workspace page"
    echo "  3. Check console - the error should be gone"
    echo "  4. Test Notes and Evidence tabs"
    echo ""
else
    echo ""
    echo "================================================================"
    echo "❌ ERROR - Fix failed to apply"
    echo "================================================================"
    echo ""
    echo "Please check the error message above and:"
    echo "  1. Verify your DATABASE_URL is correct"
    echo "  2. Ensure you have the necessary permissions"
    echo "  3. Check if the tables exist in your database"
    echo ""
    exit 1
fi

