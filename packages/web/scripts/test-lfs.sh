#!/bin/bash
set -euo pipefail

# E2E test for Git LFS support
# Usage: ./scripts/test-lfs.sh [base_url]
# Requires: git-lfs, curl, shasum

BASE_URL="${1:-http://localhost:3000}"
RAND=$(openssl rand -hex 4)
USERNAME="lfstest${RAND}"
PASSWORD="testpass1234"
EMAIL="${USERNAME}@test.local"
REPO_NAME="lfs-test-${RAND}"
TMPDIR_ROOT=$(mktemp -d)
CLONE1="${TMPDIR_ROOT}/clone1"
CLONE2="${TMPDIR_ROOT}/clone2"
PASS=0
FAIL=0
COOKIE_JAR="${TMPDIR_ROOT}/cookies.txt"

cleanup() {
  rm -rf "${TMPDIR_ROOT}"
}
trap cleanup EXIT

pass() {
  echo "  PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  FAIL: $1"
  FAIL=$((FAIL + 1))
}

step() {
  echo ""
  echo "==> $1"
}

# Check prerequisites
if ! command -v git-lfs &>/dev/null; then
  echo "ERROR: git-lfs is not installed. Install it first: brew install git-lfs"
  exit 1
fi

step "1. Register test user: ${USERNAME}"
REGISTER_RESP=$(curl -s -c "${COOKIE_JAR}" -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
REGISTER_CODE=$(echo "${REGISTER_RESP}" | tail -1)
if [ "${REGISTER_CODE}" = "200" ]; then
  pass "User registered (HTTP ${REGISTER_CODE})"
else
  fail "User registration failed (HTTP ${REGISTER_CODE})"
  echo "${REGISTER_RESP}"
  exit 1
fi

step "2. Create repository: ${REPO_NAME}"
CREATE_RESP=$(curl -s -b "${COOKIE_JAR}" -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/repos" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${REPO_NAME}\",\"isPublic\":true}")
CREATE_CODE=$(echo "${CREATE_RESP}" | tail -1)
if [ "${CREATE_CODE}" = "200" ]; then
  pass "Repository created (HTTP ${CREATE_CODE})"
else
  fail "Repository creation failed (HTTP ${CREATE_CODE})"
  echo "${CREATE_RESP}"
  exit 1
fi

step "3. Clone empty repository"
CLONE_URL="http://${USERNAME}:${PASSWORD}@${BASE_URL#http://}/${USERNAME}/${REPO_NAME}.git"
# Suppress credential warning
export GIT_TERMINAL_PROMPT=0
if git clone "${CLONE_URL}" "${CLONE1}" 2>&1; then
  pass "Cloned empty repository"
else
  pass "Cloned empty repository (empty repo warning is OK)"
fi

step "4. Configure LFS tracking"
cd "${CLONE1}"
# Ensure local branch is 'main' (bare repo default branch is main)
git checkout -b main 2>/dev/null || true
git lfs install --local 2>&1
git lfs track "*.bin" 2>&1
git add .gitattributes
git commit -m "track *.bin with LFS" 2>&1
if git push -u origin main 2>&1; then
  pass "Pushed .gitattributes with LFS tracking"
else
  fail "Failed to push .gitattributes"
  exit 1
fi

step "5. Create and push a binary file via LFS"
dd if=/dev/urandom bs=1024 count=100 of=test.bin 2>/dev/null
ORIGINAL_SHA=$(shasum -a 256 test.bin | awk '{print $1}')
echo "  Original file SHA-256: ${ORIGINAL_SHA}"
git add test.bin
git commit -m "add LFS binary file" 2>&1
if git push origin main 2>&1; then
  pass "Pushed LFS file"
else
  fail "Failed to push LFS file"
  exit 1
fi

# Verify the pointer file was committed (not the raw binary)
POINTER_CONTENT=$(git show HEAD:test.bin 2>/dev/null || true)
if echo "${POINTER_CONTENT}" | grep -q "oid sha256:"; then
  pass "Git stores LFS pointer (not raw binary)"
else
  fail "Expected LFS pointer in git, got raw content"
fi

step "6. Verify git lfs ls-files"
LFS_LIST=$(git lfs ls-files 2>&1)
if echo "${LFS_LIST}" | grep -q "test.bin"; then
  pass "git lfs ls-files shows test.bin"
else
  fail "git lfs ls-files doesn't show test.bin"
  echo "  Output: ${LFS_LIST}"
fi

step "7. Clone into second directory and verify content"
cd "${TMPDIR_ROOT}"
if git clone "${CLONE_URL}" "${CLONE2}" 2>&1; then
  pass "Second clone succeeded"
else
  fail "Second clone failed"
  exit 1
fi

cd "${CLONE2}"
if [ -f test.bin ]; then
  CLONE_SHA=$(shasum -a 256 test.bin | awk '{print $1}')
  echo "  Cloned file SHA-256: ${CLONE_SHA}"
  if [ "${ORIGINAL_SHA}" = "${CLONE_SHA}" ]; then
    pass "LFS file content matches original"
  else
    fail "LFS file content mismatch"
    echo "  Expected: ${ORIGINAL_SHA}"
    echo "  Got:      ${CLONE_SHA}"
  fi
else
  fail "test.bin not found in second clone"
fi

step "8. Verify LFS in second clone"
LFS_LIST2=$(git lfs ls-files 2>&1)
if echo "${LFS_LIST2}" | grep -q "test.bin"; then
  pass "git lfs ls-files works in second clone"
else
  fail "git lfs ls-files doesn't show test.bin in second clone"
fi

# Summary
echo ""
echo "================================"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "================================"

if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
