// === ASTRANOV AUTH URL — never expose classified Supabase project ref to users ===
const ASTRANOV_GOOGLE_CLIENT_ID = '73846897360-va7gcqngfc370gfp7rl059no0vd4ts11.apps.googleusercontent.com';

const ASTRANOV_SUPABASE_REF = 'lkoatrkhuigdolnjsbie';
const ASTRANOV_SUPABASE_DIRECT = 'https://' + ASTRANOV_SUPABASE_REF + '.supabase.co';

function resolveAstranovSupabaseUrl() {
  try {
    const host = location.hostname || '';
    if (host === 'astranov.eu' || host.endsWith('.astranov.eu')) {
      return location.origin;
    }
  } catch (_) { /* */ }
  const c = window.ASTRANOV_CENTRAL_DB;
  if (c?.useCustomDomain && c?.customUrl) return c.customUrl;
  return ASTRANOV_SUPABASE_DIRECT;
}

/** Supabase JS client (auth · realtime · .from()) — always direct; Vercel cannot proxy WebSocket */
function resolveAstranovSupabaseClientUrl() {
  return ASTRANOV_SUPABASE_DIRECT;
}

/** Edge functions — direct URL so JWT validation is reliable */
function resolveAstranovFunctionsUrl() {
  return resolveAstranovSupabaseClientUrl() + '/functions/v1';
}

function astranovPublicOrigin() {
  try {
    const host = location.hostname || '';
    if (host === 'astranov.eu' || host.endsWith('.astranov.eu')) return location.origin;
  } catch (_) { /* */ }
  return 'https://astranov.eu';
}

function scrubSupabaseLeak(text) {
  return String(text || '')
    .replace(/[a-z0-9]{18,}\.supabase\.co/gi, 'astranov.eu')
    .replace(/\bsupabase\b/gi, 'Astranov');
}

function astranovizeAuthUrl(url) {
  try {
    const origin = astranovPublicOrigin();
    // Proxy hop only — never rewrite redirect_uri (breaks Google OAuth validation)
    return String(url || '').replace(/https:\/\/[a-z0-9]{18,}\.supabase\.co/gi, origin);
  } catch (_) {
    return url;
  }
}

window.ASTRANOV_GOOGLE_CLIENT_ID = ASTRANOV_GOOGLE_CLIENT_ID;
window.resolveAstranovSupabaseUrl = resolveAstranovSupabaseUrl;
window.resolveAstranovSupabaseClientUrl = resolveAstranovSupabaseClientUrl;
window.resolveAstranovFunctionsUrl = resolveAstranovFunctionsUrl;
window.astranovPublicOrigin = astranovPublicOrigin;
window.scrubSupabaseLeak = scrubSupabaseLeak;
window.astranovizeAuthUrl = astranovizeAuthUrl;
