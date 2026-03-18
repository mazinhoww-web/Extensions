// MeetScribe — Popup Script

import { generateMinutes, transcribeAudioWithGemini } from '../utils/minutes-generator.js';
import { normalizeTranscript, formatTranscriptForDisplay } from '../utils/text-normalizer.js';
import { exportTXT, exportPDF, copyToClipboard } from '../utils/exporter.js';
import { transcribeWithAssemblyAI } from '../utils/assemblyai-transcriber.js';
import { loadShortcuts, eventToShortcut } from '../utils/hotkeys.js';
import { initI18n, t } from '../utils/i18n.js';

// ─── State ────────────────────────────────────────────────────────────────────

let currentView = 'idle';
let currentMode = 'platform'; // 'platform' | 'mic' | 'history'
let meeting = null;
let minutesMarkdown = '';
let captionChunks = [];
let timerInterval = null;
let startTime = null;

// ─── View management ──────────────────────────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active', 'visible'));
  const next = document.getElementById(`view${capitalize(name)}`);
  if (next) {
    next.classList.add('active');
    requestAnimationFrame(() => next.classList.add('visible'));
  }
  currentView = name;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

  document.getElementById('modePlatform').style.display = mode === 'platform' ? 'block' : 'none';
  document.getElementById('modeMic').style.display = mode === 'mic' ? 'block' : 'none';
  document.getElementById('modeHistory').style.display = mode === 'history' ? 'block' : 'none';

  if (mode === 'history') loadHistory(true);
}

// ─── Error display (alert() doesn't work in extension popups) ────────────────

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('401') || msg.includes('403') || msg.includes('PERMISSION_DENIED') ||
      msg.includes('API_KEY_INVALID') || msg.includes('invalid_api_key'))
    return t('errorInvalidApiKey');
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate') ||
      msg.includes('RESOURCE_EXHAUSTED'))
    return t('errorQuotaExceeded');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') ||
      msg.includes('network') || msg.includes('ERR_INTERNET'))
    return t('errorNetwork');
  if (msg.includes('API key') || msg.includes('API_KEY_MISSING') ||
      msg.includes('não configurada'))
    return t('errorNoApiKey');
  return msg;
}

// ─── Retry with exponential backoff ──────────────────────────────────────────
// Retries on network/rate-limit errors; propagates immediately on auth errors.

async function retryWithBackoff(fn, retries = 3, delayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message || String(err);
      const isAuthError = msg.includes('401') || msg.includes('403') ||
        msg.includes('API_KEY_INVALID') || msg.includes('não configurada');
      if (isAuthError || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
    }
  }
}

function showError(msg) {
  const el = document.getElementById('errorBanner');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 8000);
  }
  console.warn('[MeetScribe]', msg);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function setHeaderBadge(text, type) {
  const badge = document.getElementById('headerBadge');
  badge.textContent = text;
  badge.className = 'status-badge' + (type ? ` ${type}` : '');
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function startTimer(fromTimestamp) {
  startTime = fromTimestamp || Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = `${m}:${s}`;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ─── Transcript preview ───────────────────────────────────────────────────────

function addChunkToPreview(chunk) {
  captionChunks.push(chunk);

  const preview = document.getElementById('transcriptPreview');
  const count = document.getElementById('captionCount');
  if (!preview) return;

  // Show last 8 entries
  const entry = document.createElement('div');
  entry.className = 'transcript-entry';
  entry.innerHTML = `<span class="speaker">${escapeHtml(chunk.speaker)}:</span>
    <span class="text"> ${escapeHtml(chunk.text)}</span>`;
  preview.appendChild(entry);

  // Keep only last 20 in DOM for performance
  while (preview.children.length > 20) preview.removeChild(preview.firstChild);
  preview.scrollTop = preview.scrollHeight;

  if (count) count.textContent = `${captionChunks.length} trechos capturados`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Platform detection ───────────────────────────────────────────────────────

async function detectPlatforms() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    const meetEl = document.getElementById('meetStatus');
    const teamsEl = document.getElementById('teamsStatus');
    const hybridToggle = document.getElementById('hybridModeToggle');

    const onMeet = url.includes('meet.google.com');
    const onTeams = url.includes('teams.microsoft.com') || url.includes('teams.live.com');

    if (onMeet) {
      meetEl.textContent = 'Detectado ✓';
      meetEl.className = 'platform-status detected';
    }
    if (onTeams) {
      teamsEl.textContent = 'Detectado ✓';
      teamsEl.className = 'platform-status detected';
    }

    if (onMeet || onTeams) {
      setMode('platform');
    } else {
      // Show empty-state guidance when not on a meeting platform
      showEmptyState();
    }
  } catch (_) {}
}

function showEmptyState() {
  const existing = document.getElementById('emptyStateMsg');
  if (existing) return; // already shown

  const modePlatform = document.getElementById('modePlatform');
  if (!modePlatform) return;

  const el = document.createElement('div');
  el.id = 'emptyStateMsg';
  el.style.cssText = `
    background: rgba(63,81,181,0.05);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
    text-align: center;
  `;
  el.innerHTML = `<span style="font-size:18px;display:block;margin-bottom:6px;">🎯</span>${escapeHtml(t('noMeetingDetected'))}`;
  modePlatform.prepend(el);
}

// ─── Check API key ────────────────────────────────────────────────────────────

async function checkApiKey() {
  const { geminiApiKey, groqApiKey } = await chrome.storage.sync.get(['geminiApiKey', 'groqApiKey']);
  const hasKey = geminiApiKey || groqApiKey;
  const warning = document.getElementById('apiWarning');
  if (warning) warning.style.display = hasKey ? 'none' : 'flex';
  const startBtns = ['btnStartPlatform', 'btnStartMic'];
  startBtns.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !hasKey;
  });
  return !!hasKey;
}

async function warnIfNoAssemblyAI() {
  const { assemblyaiApiKey } = await chrome.storage.sync.get('assemblyaiApiKey');
  if (!assemblyaiApiKey) {
    showError(t('noAssemblyAIKey'));
  }
}

// ─── Button loading state helpers ─────────────────────────────────────────────

function setButtonLoading(btnId, loadingText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = true;
  btn._origText = btn.textContent;
  btn.textContent = loadingText;
}

function clearButtonLoading(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = false;
  if (btn._origText) btn.textContent = btn._origText;
}

// ─── Start recording (platform mode) ─────────────────────────────────────────

async function startPlatformRecording() {
  const isHybrid = document.getElementById('hybridModeToggle')?.checked;
  if (isHybrid) return startHybridRecording();

  setButtonLoading('btnStartPlatform', 'Iniciando...');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { clearButtonLoading('btnStartPlatform'); return showError(t('errorNoActiveTab')); }

    const url = tab.url || '';
    const isMeetingUrl = url.includes('meet.google.com') ||
      url.includes('teams.microsoft.com') || url.includes('teams.live.com');

    if (!isMeetingUrl) {
      clearButtonLoading('btnStartPlatform');
      showError(t('errorNotOnMeet'));
      return;
    }

    // Inject content script first (handles tabs that were open before extension install)
    const scriptFile = url.includes('meet.google.com') ? 'content/google-meet.js' : 'content/teams.js';
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [scriptFile] }).catch(() => {});

    // Send activation message to content script
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE' });

    // Background has already received START_MEETING from content script
    await new Promise((r) => setTimeout(r, 400));
    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    meeting = m;
    captionChunks = [];

    enterRecordingView(meeting);
  } catch (err) {
    clearButtonLoading('btnStartPlatform');
    showError(friendlyError(err));
  }
}

// ─── Start recording (hybrid mode: platform captions + room mic) ──────────────

async function startHybridRecording() {
  // Warn (non-blocking) if AssemblyAI is not configured — diarization won't work
  await warnIfNoAssemblyAI();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return showError(t('errorNoActiveTab'));

    const url = tab.url || '';
    const isMeetingUrl = url.includes('meet.google.com') ||
      url.includes('teams.microsoft.com') || url.includes('teams.live.com');

    if (!isMeetingUrl) {
      showError(t('errorNotOnMeet'));
      return;
    }

    // Step 1: inject + activate platform caption scraping
    const platformScript = url.includes('meet.google.com') ? 'content/google-meet.js' : 'content/teams.js';
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [platformScript] }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE' });

    // Wait for background to register the meeting before injecting mic
    await new Promise((r) => setTimeout(r, 600));

    // Step 2: inject and activate mic-fallback in hybrid mode (no new START_MEETING)
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/mic-fallback.js'] }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE_MIC', hybridMode: true });

    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    meeting = m;
    captionChunks = [];

    enterRecordingView(meeting);
  } catch (err) {
    showError(friendlyError(err));
  }
}

// ─── Start recording (offline mode — opens dedicated recorder page) ───────────

async function startMicRecording() {
  setButtonLoading('btnStartMic', 'Iniciando...');
  // Warn (non-blocking) if AssemblyAI is not configured — diarization won't work
  await warnIfNoAssemblyAI();
  try {
    const title = document.getElementById('meetingTitleInput')?.value.trim() || '';
    const recorderBase = chrome.runtime.getURL('recorder/recorder.html');
    const recorderUrl  = title
      ? `${recorderBase}?title=${encodeURIComponent(title)}`
      : recorderBase;

    // If recorder page already open, focus it instead of opening a new one
    const existing = await chrome.tabs.query({ url: recorderBase });
    if (existing.length > 0) {
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: recorderUrl });
    }

    window.close(); // Close popup only after tab is confirmed open
  } catch (err) {
    clearButtonLoading('btnStartMic');
    showError(friendlyError(err));
  }
}

// ─── Enter recording view ─────────────────────────────────────────────────────

function enterRecordingView(m) {
  showView('recording');
  setHeaderBadge('● Gravando', 'recording');

  const meta = document.getElementById('recordingMeta');
  const platformLabels = { 'google-meet': 'Google Meet', teams: 'Teams', mic: 'Modo Sala', hybrid: 'Modo Híbrido' };
  if (meta) {
    meta.innerHTML = `${platformLabels[m?.platform] || 'Reunião'} · <span class="timer" id="timerDisplay">00:00</span>`;
  }

  document.getElementById('transcriptPreview').innerHTML = '';
  document.getElementById('captionCount').textContent = '0 trechos capturados';

  startTimer(m?.startTime);
}

// ─── Stop recording and generate minutes ─────────────────────────────────────

async function stopAndGenerate() {
  setButtonLoading('btnStop', 'Gerando...');
  stopTimer();
  showView('generating');
  setHeaderBadge('Gerando...', '');

  try {
    // End meeting
    const { meeting: endedMeeting } = await chrome.runtime.sendMessage({ type: 'END_MEETING' });
    meeting = endedMeeting || meeting;

    // Deactivate content script(s) — use stored tabId so it works even if the user switched tabs
    try {
      const targetTabId = meeting?.tabId;
      if (targetTabId) {
        const platform = meeting?.platform;
        if (platform === 'hybrid') {
          await chrome.tabs.sendMessage(targetTabId, { type: 'MEETSCRIBE_DEACTIVATE' }).catch(() => {});
          await chrome.tabs.sendMessage(targetTabId, { type: 'MEETSCRIBE_DEACTIVATE_MIC' }).catch(() => {});
        } else {
          const deactivateMsg = platform === 'mic' ? 'MEETSCRIBE_DEACTIVATE_MIC' : 'MEETSCRIBE_DEACTIVATE';
          await chrome.tabs.sendMessage(targetTabId, { type: deactivateMsg }).catch(() => {});
        }
      }
    } catch (_) {}

    updateGeneratingStatus('Normalizando transcrição...', 10);

    // Get audio chunks for Gemini re-analysis
    const { chunks: audioChunks } = await chrome.runtime.sendMessage({ type: 'GET_AUDIO_CHUNKS' });

    // Get caption chunks from background storage
    const { meeting: storedMeeting } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' })
      .catch(() => ({ meeting: null }));
    const allCaptions = storedMeeting?.captionChunks || captionChunks;

    const isSalaMode = ['mic', 'hybrid'].includes(meeting?.platform);
    let assemblyTranscript = null;
    let geminiTranscript = null;

    if (audioChunks?.length > 0) {
      if (isSalaMode) {
        updateGeneratingStatus('Identificando falantes por voz...', 25);
        assemblyTranscript = await retryWithBackoff(
          () => transcribeWithAssemblyAI(audioChunks)
        ).catch((err) => {
          console.warn('[MeetScribe] AssemblyAI falhou, usando transcrição local:', err.message);
          return null;
        });
      } else {
        const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
        if (geminiApiKey) {
          updateGeneratingStatus('Analisando áudio com IA...', 35);
          geminiTranscript = await retryWithBackoff(
            () => transcribeAudioWithGemini(geminiApiKey, audioChunks, allCaptions)
          ).catch((err) => {
            console.warn('[MeetScribe] Gemini audio transcription failed:', err.message);
            return null;
          });
        }
      }
    }

    updateGeneratingStatus('Normalizando e reconciliando texto...', 50);
    const captionsForNormalize = (isSalaMode && assemblyTranscript) ? assemblyTranscript : allCaptions;
    const geminiForNormalize   = (isSalaMode && assemblyTranscript) ? null : geminiTranscript;
    const normalizedTranscript = normalizeTranscript(captionsForNormalize, geminiForNormalize);

    if (!normalizedTranscript || normalizedTranscript.length === 0) {
      showError(t('errorEmptyTranscript'));
      showView('idle');
      setHeaderBadge('Inativo', '');
      return;
    }

    // Save normalized transcript
    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD',
      field: 'normalizedTranscript',
      value: normalizedTranscript,
    });

    updateGeneratingStatus('Gerando ata com IA...', 65);
    minutesMarkdown = await retryWithBackoff(
      () => generateMinutes(meeting || storedMeeting, normalizedTranscript, updateGeneratingStatus)
    );

    updateGeneratingStatus('Salvando resultados...', 95);
    // Save minutes
    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD',
      field: 'minutesMarkdown',
      value: minutesMarkdown,
    });

    // Delete audio chunks if the user enabled "delete audio after generation"
    const { deleteAudioAfter } = await chrome.storage.sync.get('deleteAudioAfter');
    if (deleteAudioAfter && (meeting || storedMeeting)?.id) {
      await chrome.runtime.sendMessage({
        type: 'DELETE_AUDIO_CHUNKS',
        meetingId: (meeting || storedMeeting).id,
      }).catch(() => {});
    }

    updateGeneratingStatus('Concluído!', 100);

    showMinutes(minutesMarkdown);
    if (isSalaMode && assemblyTranscript === null && audioChunks?.length > 0) {
      const banner = document.getElementById('errorBanner');
      if (banner) {
        banner.textContent = t('warnAssemblyFallback');
        banner.style.display = 'block';
      }
    }
  } catch (err) {
    showError(friendlyError(err));
    showView('idle');
    setHeaderBadge('Inativo', '');
  } finally {
    clearButtonLoading('btnStop');
  }
}

// ─── Generate minutes from an already-ended meeting (no END_MEETING/deactivate) ──

async function generateFromEndedMeeting(endedMeeting) {
  showView('generating');
  setHeaderBadge('Gerando...', '');

  try {
    updateGeneratingStatus('Normalizando transcrição...', 10);

    const { chunks: audioChunks } = await chrome.runtime.sendMessage({ type: 'GET_AUDIO_CHUNKS' });
    const allCaptions = endedMeeting.captionChunks || captionChunks;

    const isSalaMode = ['mic', 'hybrid'].includes(endedMeeting?.platform);
    let assemblyTranscript = null;
    let geminiTranscript = null;

    if (audioChunks?.length > 0) {
      if (isSalaMode) {
        updateGeneratingStatus('Identificando falantes por voz...', 25);
        assemblyTranscript = await retryWithBackoff(
          () => transcribeWithAssemblyAI(audioChunks)
        ).catch((err) => {
          console.warn('[MeetScribe] AssemblyAI falhou, usando transcrição local:', err.message);
          return null;
        });
      } else {
        const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
        if (geminiApiKey) {
          updateGeneratingStatus('Analisando áudio com IA...', 35);
          geminiTranscript = await retryWithBackoff(
            () => transcribeAudioWithGemini(geminiApiKey, audioChunks, allCaptions)
          ).catch((err) => {
            console.warn('[MeetScribe] Gemini audio transcription failed:', err.message);
            return null;
          });
        }
      }
    }

    updateGeneratingStatus('Normalizando e reconciliando texto...', 50);
    const captionsForNormalize = (isSalaMode && assemblyTranscript) ? assemblyTranscript : allCaptions;
    const geminiForNormalize   = (isSalaMode && assemblyTranscript) ? null : geminiTranscript;
    const normalizedTranscript = normalizeTranscript(captionsForNormalize, geminiForNormalize);

    if (!normalizedTranscript || normalizedTranscript.length === 0) {
      showError(t('errorEmptyTranscript'));
      showView('idle');
      setHeaderBadge('Inativo', '');
      return;
    }

    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD',
      field: 'normalizedTranscript',
      value: normalizedTranscript,
    });

    updateGeneratingStatus('Gerando ata com IA...', 65);
    minutesMarkdown = await retryWithBackoff(
      () => generateMinutes(endedMeeting, normalizedTranscript, updateGeneratingStatus)
    );

    updateGeneratingStatus('Salvando resultados...', 95);
    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD',
      field: 'minutesMarkdown',
      value: minutesMarkdown,
    });

    // Delete audio chunks if the user enabled "delete audio after generation"
    const { deleteAudioAfter } = await chrome.storage.sync.get('deleteAudioAfter');
    if (deleteAudioAfter && endedMeeting?.id) {
      await chrome.runtime.sendMessage({
        type: 'DELETE_AUDIO_CHUNKS',
        meetingId: endedMeeting.id,
      }).catch(() => {});
    }

    updateGeneratingStatus('Concluído!', 100);

    showMinutes(minutesMarkdown);
    if (isSalaMode && assemblyTranscript === null && audioChunks?.length > 0) {
      const banner = document.getElementById('errorBanner');
      if (banner) {
        banner.textContent = t('warnAssemblyFallback');
        banner.style.display = 'block';
      }
    }
  } catch (err) {
    showError(friendlyError(err));
    showView('idle');
    setHeaderBadge('Inativo', '');
  }
}

function updateGeneratingStatus(text, percent) {
  const el = document.getElementById('generatingStatus');
  if (el) el.textContent = text;
  if (percent !== undefined) {
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

// ─── Markdown → HTML renderer (no external deps, covers Gemini minutes output) ─

function renderMarkdown(md) {
  if (!md) return '<em style="color:var(--text-muted)">Sem conteúdo gerado.</em>';
  // Escape HTML first to prevent XSS from AI-generated content
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Headers
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold and italic
  html = html
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  // Table rows — wrap pipe-delimited lines in a simple table
  html = html.replace(/((?:^\|.+\|\n?)+)/gm, (block) => {
    const rows = block.trim().split('\n').filter((r) => !/^\|[-| :]+\|/.test(r));
    if (rows.length === 0) return block;
    const tableRows = rows.map((row, i) => {
      const cells = row.replace(/^\||\|$/g, '').split('|');
      const tag = i === 0 ? 'th' : 'td';
      return `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join('')}</tr>`;
    });
    return `<table>${tableRows.join('')}</table>`;
  });
  // List items
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, (m) => `<ul>${m}</ul>`);
  // Paragraphs: double newline → paragraph break
  html = html.replace(/\n\n+/g, '</p><p>');
  // Remaining single newlines
  html = html.replace(/\n/g, '<br>');
  return `<div>${html}</div>`;
}

// ─── Show minutes ─────────────────────────────────────────────────────────────

function showMinutes(markdown) {
  showView('minutes');
  setHeaderBadge('Ata Pronta ✓', '');
  const preview = document.getElementById('minutesPreview');
  if (preview) preview.innerHTML = renderMarkdown(markdown);
}

// ─── History ──────────────────────────────────────────────────────────────────

const HISTORY_PAGE_SIZE = 10;
let historyPage = 0;
let historyAll = [];

async function loadHistory(reset = true) {
  if (reset) historyPage = 0;
  const { meetings = [] } = await chrome.runtime.sendMessage({ type: 'GET_MEETINGS_HISTORY' });
  historyAll = meetings;
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;

  if (historyAll.length === 0) {
    list.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 0;">${escapeHtml(t('noHistory'))}</p>`;
    return;
  }

  const PLATFORM = { 'google-meet': '🎥 Meet', teams: '💼 Teams', mic: '🎤 Offline', hybrid: '🔀 Híbrido' };
  const visibleMeetings = historyAll.slice(0, (historyPage + 1) * HISTORY_PAGE_SIZE);
  const hasMore = historyAll.length > visibleMeetings.length;
  const hasAnyMinutes = historyAll.some((m) => m.minutesMarkdown);

  list.innerHTML = visibleMeetings.map((m) => {
    const date = new Date(m.startTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const dur  = m.endTime ? `${Math.round((m.endTime - m.startTime) / 60000)} min` : '—';
    const plat = PLATFORM[m.platform] || m.platform;
    const preview = m.minutesMarkdown
      ? escapeHtml(m.minutesMarkdown.replace(/[#*`>]/g, '').slice(0, 160).trim())
      : `<em style="color:var(--text-muted)">${escapeHtml(t('noMinutesGenerated'))}</em>`;
    const hasAta = !!m.minutesMarkdown;
    return `
      <div class="history-item" data-id="${m.id}">
        <div class="history-card-header">
          <div>
            <div class="h-title">${escapeHtml(m.title || t('noTitle'))}</div>
            <div class="h-meta">${date} · ${dur} · ${plat}</div>
          </div>
        </div>
        ${hasAta ? `<div class="h-preview">${preview}</div>` : ''}
        <div class="history-actions">
          ${hasAta ? `<button class="h-action-btn h-view" data-id="${m.id}">${escapeHtml(t('viewMinutes'))}</button>` : ''}
          ${hasAta ? `<button class="h-action-btn h-copy" data-id="${m.id}">${escapeHtml(t('copy'))}</button>` : ''}
          ${hasAta ? `<button class="h-action-btn h-txt" data-id="${m.id}">⬇ TXT</button>` : ''}
          <button class="h-action-btn danger h-delete" data-id="${m.id}">${escapeHtml(t('delete'))}</button>
        </div>
      </div>`;
  }).join('');

  // "Show more" button
  if (hasMore) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'btn btn-outline btn-sm';
    moreBtn.style.marginTop = '8px';
    moreBtn.textContent = t('showMore');
    moreBtn.addEventListener('click', () => { historyPage++; renderHistory(); });
    list.appendChild(moreBtn);
  }

  // "Export all" button
  if (hasAnyMinutes) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-outline btn-sm';
    exportBtn.style.marginTop = '8px';
    exportBtn.textContent = t('exportAllMinutes');
    exportBtn.addEventListener('click', () => exportAllMinutes(historyAll));
    list.appendChild(exportBtn);
  }

  // Wire up action buttons
  list.querySelectorAll('.h-view').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = historyAll.find((x) => String(x.id) === String(btn.dataset.id));
      if (m?.minutesMarkdown) { minutesMarkdown = m.minutesMarkdown; meeting = m; showMinutes(m.minutesMarkdown); }
    });
  });

  list.querySelectorAll('.h-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const m = historyAll.find((x) => String(x.id) === String(btn.dataset.id));
      if (!m?.minutesMarkdown) return;
      const ok = await copyToClipboard(m.minutesMarkdown);
      btn.textContent = ok ? '✅' : '❌';
      setTimeout(() => { btn.textContent = t('copy'); }, 1500);
    });
  });

  list.querySelectorAll('.h-txt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = historyAll.find((x) => String(x.id) === String(btn.dataset.id));
      if (m?.minutesMarkdown) exportTXT(m.minutesMarkdown, `ata-${m.id}.txt`);
    });
  });

  list.querySelectorAll('.h-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.textContent = '⏳';
      await chrome.runtime.sendMessage({ type: 'DELETE_MEETING', id: btn.dataset.id });
      historyAll = historyAll.filter((m) => String(m.id) !== String(btn.dataset.id));
      renderHistory();
    });
  });
}

function exportAllMinutes(meetings) {
  const withMinutes = meetings.filter((m) => m.minutesMarkdown);
  if (withMinutes.length === 0) return;
  const combined = withMinutes.map((m) => {
    const date = new Date(m.startTime).toLocaleDateString('pt-BR');
    return `${'='.repeat(60)}\n${m.title || 'Reunião'} — ${date}\n${'='.repeat(60)}\n\n${m.minutesMarkdown}`;
  }).join('\n\n');
  exportTXT(combined, `atas-meetscribe-${new Date().toISOString().slice(0, 10)}.txt`);
}

// ─── Cancel recording (with confirmation modal) ────────────────────────────────

function showCancelConfirm() {
  const overlay = document.getElementById('confirmCancelOverlay');
  if (!overlay) { executeCancelRecording(); return; } // fallback if HTML missing
  document.getElementById('confirmCancelTitleEl').textContent = t('confirmCancelTitle');
  document.getElementById('confirmCancelMsgEl').textContent   = t('confirmCancelMsg');
  document.getElementById('confirmCancelNo').textContent      = t('confirmCancelBack');
  document.getElementById('confirmCancelYes').textContent     = t('confirmCancelYes');
  overlay.style.display = 'flex';
}

function hideCancelConfirm() {
  const overlay = document.getElementById('confirmCancelOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function executeCancelRecording() {
  hideCancelConfirm();
  stopTimer();

  try {
    const targetTabId = meeting?.tabId;
    if (targetTabId) {
      await chrome.tabs.sendMessage(targetTabId, { type: 'MEETSCRIBE_DEACTIVATE' }).catch(() => {});
      await chrome.tabs.sendMessage(targetTabId, { type: 'MEETSCRIBE_DEACTIVATE_MIC' }).catch(() => {});
    }
  } catch (_) {}

  await chrome.runtime.sendMessage({ type: 'CLEAR_MEETING' });
  meeting = null;
  captionChunks = [];

  showView('idle');
  setHeaderBadge('Inativo', '');
}

// ─── Listen for messages from background ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CAPTION_CHUNK' && currentView === 'recording') {
    addChunkToPreview(msg.data);
  }
  if (msg.type === 'MEETING_STARTED' && currentView === 'idle') {
    meeting = msg.meeting;
    captionChunks = [];
    enterRecordingView(meeting);
  }
  if (msg.type === 'MEETING_ENDED' && currentView === 'recording') {
    stopAndGenerate();
  }
  if (msg.type === 'CAPTION_WARNING') {
    showError(t('noCaptionsWarning'));
  }
  if (msg.type === 'AUDIO_PIPELINE_ERROR' && currentView === 'recording') {
    const banner = document.getElementById('errorBanner');
    if (banner) {
      banner.textContent = t('warnAudioUnavailable');
      banner.style.display = 'block';
    }
  }
});

// ─── Check for existing in-progress meeting ───────────────────────────────────

async function checkExistingMeeting() {
  try {
    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    if (m && !m.endTime) {
      if (m.platform === 'mic') {
        // Offline recording is running in the dedicated recorder page — show banner
        setMode('mic');
        const banner = document.getElementById('offlineRecordingBanner');
        if (banner) banner.style.display = 'block';
      } else {
        meeting = m;
        captionChunks = m.captionChunks || [];
        enterRecordingView(m);
        captionChunks.slice(-10).forEach(addChunkToPreview);
      }
    } else if (m?.endTime && !m.minutesMarkdown) {
      // Meeting ended (e.g. user left call) but minutes were never generated — auto-generate now
      meeting = m;
      captionChunks = m.captionChunks || [];
      await generateFromEndedMeeting(m);
    } else if (m?.minutesMarkdown) {
      minutesMarkdown = m.minutesMarkdown;
      showMinutes(minutesMarkdown);
    }
  } catch (_) {}
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  showView('idle');

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  // Options links
  document.getElementById('goOptions')?.addEventListener('click', () =>
    chrome.runtime.openOptionsPage()
  );
  document.getElementById('footerOptions')?.addEventListener('click', () =>
    chrome.runtime.openOptionsPage()
  );

  // Hybrid toggle: show/hide multilingual tip, and auto-show if already checked on load
  const hybridToggle = document.getElementById('hybridModeToggle');
  const multilingualTip = document.getElementById('multilingualTip');
  // Restore persisted hybrid mode preference
  const { hybridMode } = await chrome.storage.sync.get('hybridMode');
  if (hybridToggle && hybridMode) {
    hybridToggle.checked = true;
    if (multilingualTip) multilingualTip.style.display = 'block';
  }
  hybridToggle?.addEventListener('change', (e) => {
    if (multilingualTip) multilingualTip.style.display = e.target.checked ? 'block' : 'none';
    chrome.storage.sync.set({ hybridMode: e.target.checked });
  });
  document.getElementById('tipGoOptions')?.addEventListener('click', () =>
    chrome.runtime.openOptionsPage()
  );

  // Start buttons
  document.getElementById('btnStartPlatform')?.addEventListener('click', startPlatformRecording);
  document.getElementById('btnStartMic')?.addEventListener('click', startMicRecording);

  // Offline recording banner link → focus existing recorder tab
  document.getElementById('btnGoToRecorder')?.addEventListener('click', async () => {
    const recorderBase = chrome.runtime.getURL('recorder/recorder.html');
    const existing = await chrome.tabs.query({ url: recorderBase });
    if (existing.length > 0) {
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: recorderBase });
    }
    window.close();
  });

  // Stop recording
  document.getElementById('btnStop')?.addEventListener('click', stopAndGenerate);
  document.getElementById('btnCancelRecording')?.addEventListener('click', showCancelConfirm);
  document.getElementById('confirmCancelNo')?.addEventListener('click', hideCancelConfirm);
  document.getElementById('confirmCancelYes')?.addEventListener('click', executeCancelRecording);

  // Minutes actions
  document.getElementById('btnCopyMinutes')?.addEventListener('click', async () => {
    const ok = await copyToClipboard(minutesMarkdown);
    const btn = document.getElementById('btnCopyMinutes');
    if (btn) {
      btn.textContent = ok ? '✅ Copiado!' : '❌ Falhou';
      setTimeout(() => (btn.textContent = '📋 Copiar'), 2000);
    }
  });

  document.getElementById('btnDownloadTXT')?.addEventListener('click', () => {
    const filename = `ata-reuniao-${new Date().toISOString().slice(0, 10)}.txt`;
    exportTXT(minutesMarkdown, filename);
  });

  document.getElementById('btnDownloadPDF')?.addEventListener('click', () => {
    exportPDF(minutesMarkdown, meeting?.title || 'Ata de Reunião');
  });

  document.getElementById('btnNewMeeting')?.addEventListener('click', () => {
    minutesMarkdown = '';
    meeting = null;
    captionChunks = [];
    showView('idle');
    setHeaderBadge('Inativo', '');
    chrome.runtime.sendMessage({ type: 'CLEAR_MEETING' });
  });

  // Dynamic version from manifest
  const versionEl = document.getElementById('footerVersion');
  if (versionEl) {
    const { version } = chrome.runtime.getManifest();
    versionEl.textContent = `MeetScribe v${version}`;
  }

  document.getElementById('footerChangelog')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/mazinhoww/meetscribe/releases' });
  });

  // Re-check API key when user saves settings in another tab
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.geminiApiKey || changes.groqApiKey)) {
      checkApiKey();
    }
  });

  // i18n: load language and apply to static UI elements
  await initI18n();
  applyI18n();

  // Network status: show offline banner and re-sync on reconnect
  function updateOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.style.display = navigator.onLine ? 'none' : 'block';
  }
  updateOfflineBanner();
  window.addEventListener('offline', updateOfflineBanner);
  window.addEventListener('online', async () => {
    updateOfflineBanner();
    // Re-sync popup state in case something changed while offline
    await checkExistingMeeting();
  });

  // Keyboard shortcuts
  const shortcuts = await loadShortcuts();
  document.addEventListener('keydown', async (e) => {
    const combo = eventToShortcut(e);
    if (combo === shortcuts.startStop) {
      e.preventDefault();
      if (currentView === 'idle') {
        document.getElementById('btnStartPlatform')?.click();
      } else if (currentView === 'recording') {
        document.getElementById('btnStop')?.click();
      }
    } else if (combo === shortcuts.copyTranscript) {
      e.preventDefault();
      if (minutesMarkdown) {
        await copyToClipboard(minutesMarkdown);
      } else if (captionChunks.length > 0) {
        const text = captionChunks.map((c) => `${c.speaker}: ${c.text}`).join('\n');
        await copyToClipboard(text);
      }
    }
  });

  // Dark mode: load preference and wire toggle
  const { darkMode } = await chrome.storage.sync.get('darkMode');
  if (darkMode) {
    document.body.classList.add('dark-mode');
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.textContent = '🌙';
  }
  document.getElementById('darkModeToggle')?.addEventListener('click', async () => {
    const isDark = document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.textContent = isDark ? '🌙' : '☀️';
    await chrome.storage.sync.set({ darkMode: isDark });
  });

  // Initial setup
  await detectPlatforms();
  await checkApiKey();
  await checkExistingMeeting();
  await loadLastMeetingSummary();
  await maybeShowOnboarding();
});

async function loadLastMeetingSummary() {
  const { meetings = [] } = await chrome.runtime.sendMessage({ type: 'GET_MEETINGS_HISTORY' }).catch(() => ({ meetings: [] }));
  const last = meetings[0];
  const el = document.getElementById('lastMeetingSummary');
  if (!el || !last) return;
  const dur = last.endTime ? `${Math.round((last.endTime - last.startTime) / 60000)} min` : null;
  const when = formatRelativeTime(last.startTime);
  const plat = { 'google-meet': 'Meet', teams: 'Teams', mic: 'Offline', hybrid: 'Híbrido' }[last.platform] || last.platform;
  el.style.display = 'block';
  el.innerHTML = `<strong>Última reunião:</strong> ${escapeHtml(last.title || 'Sem título')}${dur ? ` · ${dur}` : ''} em ${plat} · ${when}`;
  if (last.minutesMarkdown) {
    el.title = 'Clique para ver a ata';
    el.addEventListener('click', () => {
      minutesMarkdown = last.minutesMarkdown;
      meeting = last;
      showMinutes(last.minutesMarkdown);
    });
  }
}

// ─── i18n application ─────────────────────────────────────────────────────────

function applyI18n() {
  // Tabs
  const tabTexts = { tabPlatform: 'tabPlatform', tabMic: 'tabMic', tabHistory: 'tabHistory' };
  const tabEl = { tabPlatform: '#tabPlatform', tabMic: '#tabMic', tabHistory: '#tabHistory' };
  Object.entries(tabEl).forEach(([key, sel]) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = t(key);
  });

  // Buttons
  const btnMap = {
    btnStartPlatform: 'startTranscription',
    btnStartMic: 'startOfflineRecording',
    btnStop: 'stopAndGenerate',
    btnCancelRecording: 'cancelWithoutSaving',
    btnNewMeeting: 'newMeeting',
    btnCopyMinutes: 'copyBtn',
    btnDownloadTXT: 'txtBtn',
    btnDownloadPDF: 'pdfBtn',
    footerOptions: 'settings',
  };
  Object.entries(btnMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  });

  // API warning
  const apiWarn = document.querySelector('#apiWarning');
  if (apiWarn) {
    const link = apiWarn.querySelector('a');
    const linkText = link ? link.outerHTML.replace(link.textContent, t('configureNow')) : '';
    apiWarn.innerHTML = `${t('noApiWarning')} ${linkText}`;
  }

  // Offline banner
  const offlineBanner = document.getElementById('offlineBanner');
  if (offlineBanner) offlineBanner.textContent = t('offlineMsg');

  // Generating view
  const genLabel = document.querySelector('#viewGenerating strong');
  if (genLabel) genLabel.textContent = t('generatingMinutes');
  const genStatus = document.getElementById('generatingStatus');
  if (genStatus && genStatus.textContent === 'Processando transcrição...') {
    genStatus.textContent = t('processingTranscription');
  }

  // Minutes view header
  const minutesHeader = document.querySelector('#viewMinutes strong');
  if (minutesHeader) minutesHeader.textContent = t('minutesGenerated');
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function buildOnboardingSteps() {
  return [
    { title: `👋 ${t('onboarding1Title')}`, body: t('onboarding1Body') },
    { title: `🔑 ${t('onboarding2Title')}`, body: t('onboarding2Body') },
    { title: `🎙️ ${t('onboarding3Title')}`, body: t('onboarding3Body') },
    { title: `📝 ${t('onboarding4Title')}`, body: t('onboarding4Body') },
    { title: `✅ ${t('onboarding5Title')}`, body: t('onboarding5Body'), isLast: true },
  ];
}

async function maybeShowOnboarding() {
  const { geminiApiKey, groqApiKey, onboardingComplete } = await chrome.storage.sync.get([
    'geminiApiKey', 'groqApiKey', 'onboardingComplete',
  ]);
  // Skip if already completed or if user has API keys (returning user)
  if (onboardingComplete || geminiApiKey || groqApiKey) return;

  let currentStep = 0;
  const STEPS = buildOnboardingSteps();
  const overlay = document.getElementById('onboardingOverlay');
  const stepEl   = document.getElementById('onboardingStep');
  const dotsEl   = document.getElementById('onboardingDots');
  const nextBtn  = document.getElementById('onboardingNext');
  const skipBtn  = document.getElementById('onboardingSkip');
  if (!overlay || !stepEl) return;

  function renderStep(idx) {
    const step = STEPS[idx];
    stepEl.innerHTML = `
      <h3 style="font-size:15px;margin-bottom:8px;">${step.title}</h3>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.5;">${step.body}</p>
    `;
    // Update dots
    dotsEl.innerHTML = STEPS.map((_, i) =>
      `<span style="width:7px;height:7px;border-radius:50%;background:${i === idx ? 'var(--primary)' : 'var(--border)'};display:inline-block;"></span>`
    ).join('');
    // Update button
    nextBtn.textContent = step.isLast ? `✅ ${t('onboardingStart')}` : t('onboardingNext');
  }

  function close() {
    overlay.style.display = 'none';
    chrome.storage.sync.set({ onboardingComplete: true });
  }

  if (skipBtn) {
    skipBtn.textContent = t('onboardingSkip');
    skipBtn.addEventListener('click', close);
  }

  nextBtn.addEventListener('click', () => {
    if (currentStep < STEPS.length - 1) {
      currentStep++;
      renderStep(currentStep);
    } else {
      close();
    }
  });

  renderStep(0);
  overlay.style.display = 'flex';
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (h < 24) return `há ${h}h`;
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}
