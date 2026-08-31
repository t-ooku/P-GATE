const FIRST_DETECTED_PATTERN = /First detected: `([^`]+)`/u;
const LAST_DETECTED_PATTERN = /Last detected: `([^`]+)`/u;

export function hasThreeConsecutivePostIncidentSuccesses(
  runs,
  currentRunId,
  issueBody,
  currentRunAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1),
  currentEvent = process.env.GITHUB_EVENT_NAME || 'schedule'
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

  const previous = (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.id !== currentRunId
      && run?.event === 'schedule'
      && Number(run?.run_attempt) === 1
      && Date.parse(String(run?.created_at || '')) >= recoveryBoundary)
    .slice(0, 2);
  return previous.length === 2 && previous.every((run) => run?.conclusion === 'success');
}
