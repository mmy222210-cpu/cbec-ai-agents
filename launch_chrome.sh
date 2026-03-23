#!/bin/bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome_debug_profile" \
  --no-first-run \
  --disable-sync \
  &
CHROME_PID=$!
echo "Chrome PID: $CHROME_PID"
sleep 8
echo "Testing debug port..."
curl -s http://127.0.0.1:9222/json/version
echo ""
