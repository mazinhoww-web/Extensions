// MeetScribe — Background Service Worker
// Manages meeting state, storage, and communication between content scripts and popup

// ─── IndexedDB for audio storage ─────────────────────────────────────────────

const DB_NAME = 'MeetScribeAudio';
const DB_VERSION = 1;
const STORE_NAME = 'audioChunks';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'meetingId' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveAudioChunk(meetingId, blob) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(meetingId);
    getReq.onsuccess = () => {
      const existing = getReq.result || { meetingId, chunks: [] };
      existing.chunks.push(blob);
      store.put(existing);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    };
  });
}

async function getAudioChunks(meetingId) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(meetingId);
    req.onsuccess = () => resolve(req.result ? req.result.chunks : []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteAudioChunks(meetingId) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(meetingId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ─── Meeting State ────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function getCurrentMeeting() {
  const { currentMeeting } = await chrome.storage.local.get('currentMeeting');
  return currentMeeting || null;
}

async function startMeeting(platform, title = '') {
  const meeting = {
    id: generateId(),
    platform,
    title: title || `Reunião ${new Date().toLocaleDateString('pt-BR')}`,
    startTime: Date.now(),
    endTime: null,
    captionChunks: [],
    normalizedTranscript: [],
    minutesMarkdown: null,
  };
  await chrome.storage.local.set({ currentMeeting: meeting });
  return meeting;
}

async function addCaptionChunk(chunk) {
  const meeting = await getCurrentMeeting();
  if (!meeting) return;
  meeting.captionChunks.push(chunk);
  await chrome.storage.local.set({ currentMeeting: meeting });
}

async function endMeeting() {
  const meeting = await getCurrentMeeting();
  if (!meeting) return null;
  meeting.endTime = Date.now();
  await chrome.storage.local.set({ currentMeeting: meeting });

  // Save to history (last 10 meetings, without audio blobs)
  const { meetings = [] } = await chrome.storage.local.get('meetings');
  meetings.unshift({ ...meeting });
  if (meetings.length > 10) meetings.splice(10);
  await chrome.storage.local.set({ meetings });

  return meeting;
}

async function saveMeetingField(field, value) {
  const meeting = await getCurrentMeeting();
  if (!meeting) return;
  meeting[field] = value;
  await chrome.storage.local.set({ currentMeeting: meeting });
}

async function clearCurrentMeeting() {
  const meeting = await getCurrentMeeting();
  if (meeting) await deleteAudioChunks(meeting.id);
  await chrome.storage.local.remove('currentMeeting');
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error('[MeetScribe background] Error:', err);
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'START_MEETING': {
      const platform = msg.platform || 'mic';
      // Check if a meeting is already active (e.g. platform content script started it,
      // then hybrid mic activation arrives — don't overwrite, just promote to 'hybrid')
      const existing = await getCurrentMeeting();
      if (existing && !existing.endTime) {
        if (platform !== existing.platform && platform !== 'mic') {
          // Different platform source joined — shouldn't happen normally
        } else if (platform === 'mic' && existing.platform !== 'mic') {
          // Mic source joining an existing platform meeting → promote to hybrid
          existing.platform = 'hybrid';
          await chrome.storage.local.set({ currentMeeting: existing });
          notifyPopup({ type: 'MEETING_STARTED', meeting: existing });
          return { success: true, meeting: existing };
        }
        // Same platform or already hybrid — return existing meeting
        return { success: true, meeting: existing };
      }
      const meeting = await startMeeting(platform, msg.title);
      // Notify any open popup
      notifyPopup({ type: 'MEETING_STARTED', meeting });
      return { success: true, meeting };
    }

    case 'CAPTION_CHUNK': {
      await addCaptionChunk(msg.data);
      notifyPopup({ type: 'CAPTION_CHUNK', data: msg.data });
      return { success: true };
    }

    case 'AUDIO_CHUNK': {
      const meeting = await getCurrentMeeting();
      if (meeting && msg.blob) {
        await saveAudioChunk(meeting.id, msg.blob);
      }
      return { success: true };
    }

    case 'END_MEETING': {
      const meeting = await endMeeting();
      notifyPopup({ type: 'MEETING_ENDED', meeting });
      return { success: true, meeting };
    }

    case 'GET_CURRENT_MEETING': {
      const meeting = await getCurrentMeeting();
      return { meeting };
    }

    case 'GET_AUDIO_CHUNKS': {
      const meeting = await getCurrentMeeting();
      if (!meeting) return { chunks: [] };
      const chunks = await getAudioChunks(meeting.id);
      return { chunks };
    }

    case 'SAVE_FIELD': {
      await saveMeetingField(msg.field, msg.value);
      return { success: true };
    }

    case 'CLEAR_MEETING': {
      await clearCurrentMeeting();
      return { success: true };
    }

    case 'GET_MEETINGS_HISTORY': {
      const { meetings = [] } = await chrome.storage.local.get('meetings');
      return { meetings };
    }

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}

// ─── Notify Popup ─────────────────────────────────────────────────────────────

function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup might not be open — ignore
  });
}

// ─── Content script injection on tab update ───────────────────────────────────
// Handles SPAs where the content script may need re-injection

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  let scriptFile = null;
  if (tab.url.startsWith('https://meet.google.com/')) {
    scriptFile = 'content/google-meet.js';
  } else if (
    tab.url.startsWith('https://teams.microsoft.com/') ||
    tab.url.startsWith('https://teams.live.com/') ||
    tab.url.includes('.teams.microsoft.com/')
  ) {
    scriptFile = 'content/teams.js';
  }

  if (scriptFile) {
    chrome.scripting
      .executeScript({ target: { tabId }, files: [scriptFile] })
      .catch(() => {}); // ignore if already injected
  }
});
