#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$PACKAGE_DIR/deploy-as-root.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

make_fake_id() {
  local uid="$1"
  mkdir -p "$TEST_TMP/bin"
  printf '#!/usr/bin/env bash\nif [ "${1:-}" = "-u" ]; then echo %s; else exit 0; fi\n' "$uid" > "$TEST_TMP/bin/id"
  chmod +x "$TEST_TMP/bin/id"
}

make_fake_id 1000
if PATH="$TEST_TMP/bin:$PATH" bash "$WRAPPER" >"$TEST_TMP/non-root.out" 2>&1; then
  fail "wrapper accepted a non-root caller"
fi
grep -q "must be run as root" "$TEST_TMP/non-root.out" || fail "non-root rejection was unclear"

make_fake_id 0
mkdir -p "$TEST_TMP/app" "$TEST_TMP/package"
touch "$TEST_TMP/app/package.json" "$TEST_TMP/app/.env"
if PATH="$TEST_TMP/bin:$PATH" FIT90_APP_ROOT="$TEST_TMP/app" FIT90_NODEENV="$TEST_TMP/missing-nodeenv" \
  bash "$WRAPPER" >"$TEST_TMP/missing-node.out" 2>&1; then
  fail "wrapper accepted a missing Node.js environment"
fi
grep -q "Node.js 20 environment" "$TEST_TMP/missing-node.out" || fail "missing-nodeenv rejection was unclear"

mkdir -p "$TEST_TMP/nodeenv/bin"
cat > "$TEST_TMP/nodeenv/bin/node" <<'EOF'
#!/usr/bin/env bash
echo 20.19.0
EOF
chmod +x "$TEST_TMP/nodeenv/bin/node"

cat > "$TEST_TMP/bin/runuser" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FIT90_TEST_RUNUSER_LOG"
while [ "$1" != "--" ]; do shift; done
shift
exec "$@"
EOF
chmod +x "$TEST_TMP/bin/runuser"

cat > "$TEST_TMP/package/deploy-nutrition-update.sh" <<'EOF'
#!/usr/bin/env bash
printf 'deployed:%s\n' "$1" > "$FIT90_TEST_DEPLOY_MARKER"
EOF
chmod +x "$TEST_TMP/package/deploy-nutrition-update.sh"

FIT90_TEST_RUNUSER_LOG="$TEST_TMP/runuser.log" \
FIT90_TEST_DEPLOY_MARKER="$TEST_TMP/deployed.txt" \
FIT90_APP_ROOT="$TEST_TMP/app" \
FIT90_NODEENV="$TEST_TMP/nodeenv" \
FIT90_PACKAGE_DIR="$TEST_TMP/package" \
PATH="$TEST_TMP/bin:$PATH" \
  bash "$WRAPPER" >"$TEST_TMP/success.out" 2>&1

grep -q "deployed:$TEST_TMP/app" "$TEST_TMP/deployed.txt" || fail "deployment was not run for the expected app"
grep -q -- "-u metacodecx --" "$TEST_TMP/runuser.log" || fail "deployment was not delegated to metacodecx"
grep -q "Root handoff completed" "$TEST_TMP/success.out" || fail "success was not reported"

echo "PASS: deploy-as-root wrapper"
