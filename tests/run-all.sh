#!/bin/sh
# Runs every suite against the current app.html. Kept here so it survives a reset.
cd "$(dirname "$0")"
total=0; bad=0
for f in test-*.js; do
  out=$(timeout 240 node "$f" 2>&1); last=$(echo "$out" | tail -1)
  n=$(echo "$out" | grep -c "  PASS  "); total=$((total+n))
  echo "$last" | grep -q "ALL PASSED" || bad=$((bad+1))
  printf "%-20s %s\n" "$f" "$last"
done
echo "-----"; echo "suites failing: $bad   tests passing: $total"
[ "$bad" -eq 0 ]
