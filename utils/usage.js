/**
 * Usage tracking and Free plan enforcement for MeetScribe.
 *
 * Free plan: 5 atas/month. Enforced client-side (extension checks)
 * and server-side (backend validates before generating with service_role).
 */

import { supabaseRequest, getSessionToken, getCurrentUserId } from './supabase.js';

const FREE_PLAN_LIMIT = 5;

/**
 * Get how many atas the user has generated this calendar month.
 * Returns { count, limit, remaining, canGenerate } for easy UI rendering.
 * Falls back to localStorage when not logged in.
 *
 * @returns {Promise<{count: number, limit: number, remaining: number, canGenerate: boolean, loggedIn: boolean}>}
 */
async function getUsageThisMonth() {
  const userId = await getCurrentUserId();

  if (!userId) {
    // Not logged in — use localStorage as fallback counter
    const localCount = getLocalUsageCount();
    return {
      count: localCount,
      limit: FREE_PLAN_LIMIT,
      remaining: Math.max(0, FREE_PLAN_LIMIT - localCount),
      canGenerate: localCount < FREE_PLAN_LIMIT,
      loggedIn: false,
    };
  }

  const token = await getSessionToken();
  try {
    const rows = await supabaseRequest(
      `/rest/v1/usage_current_month?user_id=eq.${userId}&select=minutes_count`,
      { method: 'GET' },
      token
    );

    const count = rows?.[0]?.minutes_count ?? 0;
    const plan = await getUserPlan();
    const isPro = plan !== 'free';

    return {
      count,
      limit: isPro ? Infinity : FREE_PLAN_LIMIT,
      remaining: isPro ? Infinity : Math.max(0, FREE_PLAN_LIMIT - count),
      canGenerate: isPro || count < FREE_PLAN_LIMIT,
      loggedIn: true,
      plan,
    };
  } catch (e) {
    console.error('[usage] Failed to fetch usage:', e);
    // Fail open — allow generation, don't block on network errors
    return { count: 0, limit: FREE_PLAN_LIMIT, remaining: FREE_PLAN_LIMIT, canGenerate: true, loggedIn: true };
  }
}

/**
 * Record that a new ata was generated.
 * Call AFTER successfully generating the ata.
 *
 * @param {object} opts
 * @param {string} opts.meetingId - local meeting ID
 * @param {string} opts.platform  - 'google_meet' | 'teams' | 'zoom' | 'offline'
 * @param {number} opts.durationS - meeting duration in seconds
 */
async function recordMinutesGenerated({ meetingId, platform, durationS } = {}) {
  incrementLocalUsageCount();

  const userId = await getCurrentUserId();
  if (!userId) return; // not logged in — local counter only

  const token = await getSessionToken();
  try {
    await supabaseRequest(
      '/rest/v1/usage',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          event: 'minutes_generated',
          meeting_id: meetingId || null,
          platform: platform || null,
          duration_s: durationS || null,
        }),
      },
      token
    );
  } catch (e) {
    console.error('[usage] Failed to record usage:', e);
    // Non-blocking — do not surface to user
  }
}

/**
 * Record an export event (Google Docs, Notion, etc.)
 *
 * @param {'export_googledocs'|'export_notion'|'export_confluence'} eventType
 * @param {string} meetingId
 */
async function recordExport(eventType, meetingId) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const token = await getSessionToken();
  try {
    await supabaseRequest(
      '/rest/v1/usage',
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, event: eventType, meeting_id: meetingId }),
      },
      token
    );
  } catch (e) {
    console.error('[usage] Failed to record export event:', e);
  }
}

/**
 * Get the user's current plan from their profile.
 * @returns {Promise<'free'|'pro'|'team'|'enterprise'>}
 */
async function getUserPlan() {
  const userId = await getCurrentUserId();
  if (!userId) return 'free';

  const token = await getSessionToken();
  try {
    const rows = await supabaseRequest(
      `/rest/v1/users?id=eq.${userId}&select=plan`,
      { method: 'GET' },
      token
    );
    return rows?.[0]?.plan ?? 'free';
  } catch (e) {
    return 'free'; // fail safe
  }
}

// ─── LocalStorage fallback (not logged in) ──────────────────────────────────

function getLocalUsageKey() {
  const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  return `meetscribe_usage_${month}`;
}

function getLocalUsageCount() {
  const key = getLocalUsageKey();
  return parseInt(localStorage.getItem(key) || '0', 10);
}

function incrementLocalUsageCount() {
  const key = getLocalUsageKey();
  const current = getLocalUsageCount();
  localStorage.setItem(key, String(current + 1));
}

export {
  FREE_PLAN_LIMIT,
  getUsageThisMonth,
  recordMinutesGenerated,
  recordExport,
  getUserPlan,
};
