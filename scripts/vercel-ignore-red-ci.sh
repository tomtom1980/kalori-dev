#!/usr/bin/env bash
# Vercel `ignoreCommand` gate: block production builds when GitHub Actions
# CI for the same commit is red (or still running past our poll window).
#
# Exit codes (per Vercel contract):
#   1 -> proceed with build (CI is green, or gate is opted out)
#   0 -> skip deployment (CI failed / cancelled)
#
# Required env (set by Vercel at build time):
#   VERCEL_GIT_COMMIT_SHA  - full commit SHA being deployed
#   VERCEL_GIT_COMMIT_REF  - branch name
#   VERCEL_GIT_REPO_OWNER  - repo owner name
#   VERCEL_GIT_REPO_SLUG   - repo slug name
# Optional:
#   GITHUB_CHECK_TOKEN     - fine-grained PAT, read-only scopes on
#                            tomtom1980/kalori (actions:read, contents:read,
#                            metadata:read). Without it, the gate logs a
#                            warning and exits 1 (fail-open) so production
#                            deploys are not bricked while the token is
#                            being provisioned.
#
# Behaviour:
#   * Only gates the `main` and `master` branches. Preview branches deploy
#     freely (exit 1) so PR flow stays fast.
#   * Polls GitHub Check Runs API every 20s for up to 8 min.
#   * Passes when every check_run has conclusion=success.
#   * Fails fast on any failure/cancelled/timed_out conclusion.
#   * If no check_runs appear within the window, fails open (exit 1) with
#     a warning - prevents an absent/misconfigured CI from permanently
#     blocking deploys.
set -euo pipefail

OWNER="${VERCEL_GIT_REPO_OWNER:-tomtom1980}"
SLUG="${VERCEL_GIT_REPO_SLUG:-kalori-tamas-dev}"
REPO="${OWNER}/${SLUG}"
MAX_POLL_SECONDS=480  # 8 minutes
POLL_INTERVAL=20

log() { printf '[vercel-ignore] %s\n' "$*"; }

SHA="${VERCEL_GIT_COMMIT_SHA:-}"
REF="${VERCEL_GIT_COMMIT_REF:-}"

if [ -z "${SHA}" ]; then
  log "VERCEL_GIT_COMMIT_SHA not set (manual CLI deploy?); allowing build."
  exit 1
fi

# Only gate production (main/master). Previews deploy without waiting.
if [ "${REF}" != "main" ] && [ "${REF}" != "master" ]; then
  log "Branch '${REF}' is not main/master; skipping CI gate (preview deploy)."
  exit 1
fi

if [ -z "${GITHUB_CHECK_TOKEN:-}" ]; then
  log "GITHUB_CHECK_TOKEN not set; gate is inactive (fail-open). Set it in"
  log "Vercel env vars to activate the gate. Proceeding with build."
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${GITHUB_CHECK_TOKEN}"
API_URL="https://api.github.com/repos/${REPO}/commits/${SHA}/check-runs?per_page=100"

log "Gating commit ${SHA} on ${REPO} CI (max wait ${MAX_POLL_SECONDS}s)."

elapsed=0
while [ "${elapsed}" -lt "${MAX_POLL_SECONDS}" ]; do
  response=$(curl -sS \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "${AUTH_HEADER}" \
    "${API_URL}" || echo '{"check_runs":[],"_curl_error":true}')

  if printf '%s' "${response}" | grep -q '"_curl_error":true'; then
    log "curl failed querying GitHub API; retrying in ${POLL_INTERVAL}s."
    sleep "${POLL_INTERVAL}"
    elapsed=$((elapsed + POLL_INTERVAL))
    continue
  fi

  total_count=$(printf '%s' "${response}" \
    | grep -o '"total_count":[[:space:]]*[0-9]\+' \
    | head -n1 \
    | grep -o '[0-9]\+' || true)
  total_count="${total_count:-0}"

  if [ "${total_count}" = "0" ]; then
    log "No check_runs reported yet; sleeping ${POLL_INTERVAL}s (elapsed ${elapsed}s)."
    sleep "${POLL_INTERVAL}"
    elapsed=$((elapsed + POLL_INTERVAL))
    continue
  fi

  # Extract all (status, conclusion) pairs. GitHub returns JSON; we avoid
  # a jq dependency by scraping with grep. Conclusion may be null while
  # status is `in_progress` / `queued`.
  statuses=$(printf '%s' "${response}" | grep -o '"status":"[a-z_]*"' | sed 's/"status":"//;s/"$//')
  conclusions=$(printf '%s' "${response}" | grep -o '"conclusion":\(null\|"[a-z_]*"\)' | sed 's/"conclusion"://;s/"//g')

  # Any hard-failed check -> skip the deploy immediately.
  if printf '%s\n' "${conclusions}" | grep -Eq '^(failure|cancelled|timed_out|action_required|startup_failure)$'; then
    log "At least one CI check failed for ${SHA}. Skipping deploy."
    log "Conclusions seen: $(printf '%s ' ${conclusions})"
    exit 0
  fi

  # All checks present AND all conclusions are success -> green, proceed.
  pending=$(printf '%s\n' "${statuses}" | grep -Evc '^completed$' || true)
  non_success=$(printf '%s\n' "${conclusions}" | grep -Evc '^(success|skipped|neutral)$' || true)

  if [ "${pending}" = "0" ] && [ "${non_success}" = "0" ]; then
    log "All ${total_count} CI checks green for ${SHA}. Proceeding with build."
    exit 1
  fi

  log "CI still running (${total_count} checks; ${pending} pending); sleeping ${POLL_INTERVAL}s (elapsed ${elapsed}s)."
  sleep "${POLL_INTERVAL}"
  elapsed=$((elapsed + POLL_INTERVAL))
done

log "Poll window (${MAX_POLL_SECONDS}s) exhausted without a green/red verdict."
log "Failing open to avoid blocking on a stalled/absent CI. Check manually."
exit 1
