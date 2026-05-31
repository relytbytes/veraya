#!/bin/bash
# share.sh — expose the app publicly for testing
# Usage: ./share.sh
# Requires: Next.js dev server already running (npm run dev)

set -e
MOBILE_DIR="$(dirname "$0")/mobile"
ENV_FILE="$MOBILE_DIR/.env.local"

echo ""
echo "🚇 Starting tunnel on port 3000..."

# Start localtunnel, capture URL from first line of output
LT_OUTPUT=$(npx --yes localtunnel --port 3000 2>&1 &
LT_PID=$!
sleep 4
jobs -p)

# Run localtunnel and grab URL
npx --yes localtunnel --port 3000 > /tmp/lt_output.txt 2>&1 &
LT_PID=$!

# Wait for URL to appear
for i in {1..15}; do
  sleep 1
  URL=$(grep -o 'https://[^ ]*\.loca\.lt' /tmp/lt_output.txt 2>/dev/null | head -1)
  if [ -n "$URL" ]; then break; fi
done

if [ -z "$URL" ]; then
  echo "❌ Could not get tunnel URL. Make sure port 3000 is running."
  kill $LT_PID 2>/dev/null
  exit 1
fi

echo "✅ Tunnel live at: $URL"
echo ""

# Update mobile/.env.local
echo "EXPO_PUBLIC_API_URL=$URL" > "$ENV_FILE"
echo "📱 Updated mobile API URL → $URL"
echo ""

# Cleanup tunnel on exit
trap "kill $LT_PID 2>/dev/null; echo ''; echo '🔌 Tunnel closed.'" EXIT

echo "📲 Starting Expo — scan the QR code with Expo Go..."
echo "   (Your friend needs the free 'Expo Go' app from the App Store / Play Store)"
echo ""

cd "$MOBILE_DIR"
npx expo start --clear
