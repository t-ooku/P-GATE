export async function readBoundedJson(request, maximumBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    return { ok: false, error: 'REQUEST_TOO_LARGE' };
  }
  if (!request.body) return { ok: false, error: 'INVALID_JSON' };
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        return { ok: false, error: 'REQUEST_TOO_LARGE' };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { ok: true, value: JSON.parse(body) };
  } catch {
    try { await reader.cancel(); } catch { /* The stream may already be closed. */ }
    return { ok: false, error: 'INVALID_JSON' };
  }
}
