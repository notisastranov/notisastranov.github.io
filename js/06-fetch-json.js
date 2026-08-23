// === FETCH JSON — timeout + visible errors for all ACI calls ===
async function fetchJson(url, options, timeoutMs) {
  const ms = timeoutMs || 55000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
    j._httpStatus = r.status;
    j._ok = r.ok;
    return j;
  } catch (e) {
    if (e.name === 'AbortError') return { error: 'timeout — server slow, try again', _timeout: true };
    return { error: String(e.message || e.cause?.message || e || 'network failed') };
  } finally {
    clearTimeout(timer);
  }
}
window.fetchJson = fetchJson;
