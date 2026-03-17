/**
 * Supabase client for MeetScribe Chrome extension
 * Used for: cloud sync, usage tracking, billing, analytics
 * Auth is handled by Lovable web dashboard — the extension receives
 * the session token via chrome.storage or postMessage from the web app.
 */

const SUPABASE_URL = 'https://smdjuguokqaughesldit.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtZGp1Z3Vva3FhdWdoZXNsZGl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzU2MjksImV4cCI6MjA4OTM1MTYyOX0.Z8mgjtsNzq2s2w1sRhcb3vR9qL2xayh-tndrfQ4sjZY';

/**
 * Low-level REST helper — avoids bundling the full Supabase SDK in the extension.
 * @param {string} path  - e.g. '/rest/v1/users?id=eq.abc'
 * @param {object} opts  - fetch options (method, body, etc.)
 * @param {string} token - JWT access token from user session (optional for anon reads)
 */
async function supabaseRequest(path, opts = {}, token = null) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${opts.method || 'GET'} ${path} → ${res.status}: ${err}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Get the current user session token from chrome.storage.
 * Set by Lovable web dashboard via chrome.storage.sync after login.
 */
async function getSessionToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['supabase_access_token'], (result) => {
      resolve(result.supabase_access_token || null);
    });
  });
}

/**
 * Get the current user ID from chrome.storage.
 */
async function getCurrentUserId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['supabase_user_id'], (result) => {
      resolve(result.supabase_user_id || null);
    });
  });
}

/**
 * Check if the user is logged in (has a valid session token).
 */
async function isLoggedIn() {
  const token = await getSessionToken();
  return !!token;
}

export {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseRequest,
  getSessionToken,
  getCurrentUserId,
  isLoggedIn,
};
