const FIRST_DETECTED_PATTERN = /First detected: `([^`]+)`/u;

export function hasThreeConsecutivePostIncidentSuccesses(runs, currentRunId, issueBody) {
  const firstDetected = Date.parse(String(issueBody || '').match(FIRST_DETECTED_PATTERN)?.[1] || '');
  if (!Number.isFinite(firstDetected)) return false;

  const previous = (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.id !== currentRunId
      && Date.parse(String(run?.created_at || '')) >= firstDetected)
    .slice(0, 2);
  return previous.length === 2 && previous.every((run) => run?.conclusion === 'success');
}
