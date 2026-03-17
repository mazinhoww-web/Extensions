/**
 * Cloud sync utilities — save/load meetings from Supabase.
 * Available to Pro/Team/Enterprise users.
 * Gracefully degrades to localStorage-only for Free users.
 */

import { supabaseRequest, getSessionToken, getCurrentUserId } from './supabase.js';
import { getUserPlan } from './usage.js';

/**
 * Sync a local meeting to Supabase cloud.
 * Creates or updates the record (upsert by local_id).
 *
 * @param {object} meeting - meeting object from localStorage
 * @returns {Promise<string|null>} cloud meeting ID, or null if sync skipped
 */
async function syncMeetingToCloud(meeting) {
  const plan = await getUserPlan();
  if (plan === 'free') return null; // Cloud sync is Pro+

  const userId = await getCurrentUserId();
  const token  = await getSessionToken();
  if (!userId || !token) return null;

  try {
    const rows = await supabaseRequest(
      '/rest/v1/meetings',
      {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          user_id:      userId,
          local_id:     meeting.id,
          title:        meeting.title || meeting.meetingTitle || null,
          platform:     meeting.platform || 'google_meet',
          started_at:   meeting.startTime ? new Date(meeting.startTime).toISOString() : null,
          ended_at:     meeting.endTime   ? new Date(meeting.endTime).toISOString()   : null,
          duration_s:   meeting.duration  || null,
          participants: meeting.speakers  || meeting.participants || null,
          minutes:      meeting.minutes   || meeting.generatedMinutes || null,
          status:       meeting.minutes   ? 'minutes_generated' : 'recorded',
          metadata:     { source: 'extension' },
        }),
      },
      token
    );
    return rows?.[0]?.id ?? null;
  } catch (e) {
    console.error('[cloud-sync] Failed to sync meeting:', e);
    return null;
  }
}

/**
 * Fetch all meetings for the current user from Supabase.
 * Used for cross-device history (Pro+).
 *
 * @param {number} limit - max meetings to fetch (default 50)
 * @returns {Promise<Array>}
 */
async function fetchCloudMeetings(limit = 50) {
  const plan = await getUserPlan();
  if (plan === 'free') return [];

  const userId = await getCurrentUserId();
  const token  = await getSessionToken();
  if (!userId || !token) return [];

  try {
    return await supabaseRequest(
      `/rest/v1/meetings?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&select=id,local_id,title,platform,started_at,ended_at,duration_s,status,minutes`,
      { method: 'GET' },
      token
    ) ?? [];
  } catch (e) {
    console.error('[cloud-sync] Failed to fetch meetings:', e);
    return [];
  }
}

/**
 * Save transcript segments for a meeting to Supabase.
 * Stored for full-text search and analytics (Pro+).
 *
 * @param {string} cloudMeetingId - UUID from meetings table
 * @param {Array}  segments       - [{speaker, text, start_ms, end_ms}]
 */
async function syncTranscriptSegments(cloudMeetingId, segments) {
  const plan = await getUserPlan();
  if (plan === 'free') return;

  const userId = await getCurrentUserId();
  const token  = await getSessionToken();
  if (!userId || !token || !cloudMeetingId || !segments?.length) return;

  try {
    const rows = segments.map(s => ({
      meeting_id: cloudMeetingId,
      user_id:    userId,
      speaker:    s.speaker || s.speakerLabel || null,
      text:       s.text || s.transcript || '',
      start_ms:   s.start_ms || s.startMs || null,
      end_ms:     s.end_ms   || s.endMs   || null,
      confidence: s.confidence || null,
    }));

    await supabaseRequest(
      '/rest/v1/transcript_segments',
      {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows),
      },
      token
    );
  } catch (e) {
    console.error('[cloud-sync] Failed to sync transcript segments:', e);
  }
}

export {
  syncMeetingToCloud,
  fetchCloudMeetings,
  syncTranscriptSegments,
};
