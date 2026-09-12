const FIRST_DETECTED_PATTERN = /First detected: `([^`]+)`/u;
const LAST_DETECTED_PATTERN = /Last detected: `([^`]+)`/u;
const MAX_RECOVERY_RUN_GAP_MS = 15 * 60 * 1000;

export function hasThreeConsecutivePostIncidentSuccesses(
  runs,
  currentRunId,
  issueBody,
  currentRunAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1),
  currentEvent = process.env.GITHUB_EVENT_NAME || 'schedule',
  currentCreatedAt = new Date().toISOString()
) {
  const body = String(issueBody || '');
  const recoveryBoundary = Date.parse(
    body.match(LAST_DETECTED_PATTERN)?.[1]
      || body.match(FIRST_DETECTED_PATTERN)?.[1]
      || ''
  );
  if (!Number.isFinite(recoveryBoundary)
    || Number(currentRunAttempt) !== 1
    || currentEvent !== 'schedule') return false;

  const candidates = (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.event === 'schedule'
      && Number(run?.run_attempt) === 1
      && Date.parse(String(run?.created_at || '')) >= recoveryBoundary)
    .sort((left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)));
  const current = candidates.find((run) => Number(run?.id) === Number(currentRunId));
  const currentAt = Date.parse(String(current?.created_at || currentCreatedAt || ''));
  if (!Number.isFinite(currentAt)) return false;
  if (current && Number(candidates[0]?.id) !== Number(currentRunId)) return false;

  // GitHub's completed-run listing does not include the currently running job.
  // Accept either response shape while anchoring recovery to this run's time.
  const previous = candidates
    .filter((run) => Number(run?.id) !== Number(currentRunId)
      && Date.parse(String(run?.created_at || '')) <= currentAt)
    .slice(0, 2);
  if (previous.length !== 2 || !previous.every((run) => run?.conclusion === 'success')) return false;

  const timeline = [currentAt, ...previous.map((run) => Date.parse(String(run.created_at)))];
  return timeline.slice(0, -1).every((createdAt, index) => {
    const gap = createdAt - timeline[index + 1];
    return gap >= 0 && gap <= MAX_RECOVERY_RUN_GAP_MS;
  });
}
