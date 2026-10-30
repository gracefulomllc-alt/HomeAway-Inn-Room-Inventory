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
# Real browser, real sync function, three phones (about 2 minutes)
out=$(timeout 400 node e2e/e2e.mjs 2>&1); last=$(echo "$out" | tail -1)
n=$(echo "$out" | grep -c "  PASS  "); total=$((total+n))
echo "$last" | grep -q "ALL PASSED" || { bad=$((bad+1)); echo "$out" | grep "FAIL"; }
printf "%-20s %s\n" "e2e (3 phones)" "$last"
echo "-----"; echo "suites failing: $bad   tests passing: $total"
[ "$bad" -eq 0 ]
