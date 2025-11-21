#!/bin/bash

# Force clear all caches and restart

echo "🧹 Forcing complete cache clear..."
echo ""

# Stop any running dev server
echo "1. Looking for running Next.js processes..."
pkill -f "next dev" || echo "   No Next.js process found (that's OK)"

# Clear Next.js cache
echo "2. Clearing Next.js cache..."
rm -rf .next
echo "   ✓ Removed .next directory"

# Clear node_modules cache
echo "3. Clearing node_modules cache..."
rm -rf node_modules/.cache
echo "   ✓ Removed node_modules/.cache"

# Clear any turbopack cache
echo "4. Clearing Turbopack cache..."
rm -rf .turbo
echo "   ✓ Removed .turbo directory (if exists)"

echo ""
echo "✅ All caches cleared!"
echo ""
echo "📝 Next steps:"
echo "   1. Run: npm run dev"
echo "   2. Close ALL browser tabs for localhost:3000"
echo "   3. Open a NEW browser tab"
echo "   4. Navigate to your workspace"
echo ""
echo "   OR try incognito/private mode to bypass browser cache!"
echo ""

