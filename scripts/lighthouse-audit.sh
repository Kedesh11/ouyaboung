#!/bin/bash

# Production Performance Testing Script
# Tests all critical routes with Lighthouse CI

# URL du site a auditer: LIGHTHOUSE_URL, sinon NEXT_PUBLIC_APP_URL (aucune URL en dur)
BASE_URL="${LIGHTHOUSE_URL:-${NEXT_PUBLIC_APP_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "Definissez LIGHTHOUSE_URL ou NEXT_PUBLIC_APP_URL (ex: LIGHTHOUSE_URL=https://mon-site.example)" >&2
  exit 1
fi
BASE_URL="${BASE_URL%/}"

echo "🚀 Starting Lighthouse Performance Audits..."
echo "Production URL: $BASE_URL"
echo ""

# Critical routes to test
ROUTES=(
  "/"
  "/search"
  "/about"
  "/p/panier-surprise-du-jour"
  "/m/chez-marie"
)

# Create results directory
mkdir -p lighthouse-results
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Running audits on ${#ROUTES[@]} routes..."
echo ""

for route in "${ROUTES[@]}"; do
  URL="${BASE_URL}${route}"
  FILENAME="lighthouse-results/lighthouse_${TIMESTAMP}_$(echo $route | tr '/' '_').json"
  
  echo "🔍 Testing: $URL"
  
  # Run Lighthouse (requires @lhci/cli or lighthouse npm package)
  npx lighthouse "$URL" \
    --output=json \
    --output-path="$FILENAME" \
    --only-categories=performance,accessibility,best-practices,seo \
    --chrome-flags="--headless --no-sandbox" \
    --quiet
  
  # Extract scores
  if [ -f "$FILENAME" ]; then
    PERF=$(cat "$FILENAME" | jq -r '.categories.performance.score * 100')
    A11Y=$(cat "$FILENAME" | jq -r '.categories.accessibility.score * 100')
    SEO=$(cat "$FILENAME" | jq -r '.categories.seo.score * 100')
    
    echo "  Performance: ${PERF}%"
    echo "  ♿ Accessibility: ${A11Y}%"
    echo "  SEO: ${SEO}%"
    echo ""
  fi
done

echo "Audits complete! Results saved to lighthouse-results/"
echo ""
echo "Next steps:"
echo "1. Review JSON files for detailed metrics"
echo "2. Test on PageSpeed Insights: https://pagespeed.web.dev/"
echo "3. Setup Google Search Console"
echo "4. Enable Vercel Analytics for RUM"
