// MeetScribe — Popup Script

import { generateMinutes, transcribeAudioWithGemini } from '../utils/minutes-generator.js';
import { normalizeTranscript, formatTranscriptForDisplay } from '../utils/text-normalizer.js';
import { exportTXT, exportPDF, copyToClipboard } from '../utils/exporter.js';

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
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById(`view${capitalize(name)}`)?.classList.add('active');
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

  if (mode === 'history') loadHistory();
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
    if (!tab?.url) return;

    const url = tab.url;
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

    // Auto-select platform tab and pre-check hybrid mode when on a meeting platform
    if (onMeet || onTeams) {
      setMode('platform');
      if (hybridToggle) {
        hybridToggle.checked = true;
        const tip = document.getElementById('multilingualTip');
        if (tip) tip.style.display = 'block';
      }
    }
  } catch (_) {}
}

// ─── Check API key ────────────────────────────────────────────────────────────

async function checkApiKey() {
  const { geminiApiKey, groqApiKey } = await chrome.storage.sync.get(['geminiApiKey', 'groqApiKey']);
  const hasKey = geminiApiKey || groqApiKey;
  const warning = document.getElementById('apiWarning');
  if (warning) warning.style.display = hasKey ? 'none' : 'flex';
  return !!hasKey;
}

// ─── Start recording (platform mode) ─────────────────────────────────────────

async function startPlatformRecording() {
  const isHybrid = document.getElementById('hybridModeToggle')?.checked;
  if (isHybrid) return startHybridRecording();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return alert('Nenhuma aba ativa encontrada.');

    const url = tab.url || '';
    const isMeetingUrl = url.includes('meet.google.com') ||
      url.includes('teams.microsoft.com') || url.includes('teams.live.com');

    if (!isMeetingUrl) {
      alert('Acesse uma reunião no Google Meet ou Microsoft Teams primeiro, depois clique em Iniciar.');
      return;
    }

    // Send activation message to content script
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE' });

    // Background has already received START_MEETING from content script
    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    meeting = m;
    captionChunks = [];

    enterRecordingView(meeting);
  } catch (err) {
    alert(`Erro ao iniciar: ${err.message}\n\nCertifique-se de estar em uma reunião ativa.`);
  }
}

// ─── Start recording (hybrid mode: platform captions + room mic) ──────────────

async function startHybridRecording() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return alert('Nenhuma aba ativa encontrada.');

    const url = tab.url || '';
    const isMeetingUrl = url.includes('meet.google.com') ||
      url.includes('teams.microsoft.com') || url.includes('teams.live.com');

    if (!isMeetingUrl) {
      alert('Acesse uma reunião no Google Meet ou Microsoft Teams primeiro, depois clique em Iniciar.');
      return;
    }

    // Step 1: activate platform caption scraping (content script sends START_MEETING)
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE' });

    // Brief wait for background to register the meeting before injecting mic
    await new Promise((r) => setTimeout(r, 600));

    // Step 2: inject and activate mic-fallback in hybrid mode (no new START_MEETING)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/mic-fallback.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE_MIC', hybridMode: true });

    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    meeting = m;
    captionChunks = [];

    enterRecordingView(meeting);
  } catch (err) {
    alert(`Erro ao iniciar modo híbrido: ${err.message}\n\nCertifique-se de estar em uma reunião ativa e ter concedido permissão de microfone.`);
  }
}

// ─── Start recording (mic mode) ───────────────────────────────────────────────

async function startMicRecording() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const title = document.getElementById('meetingTitleInput')?.value || '';

    // Inject mic-fallback script if not already loaded
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/mic-fallback.js'],
    });

    // Send title to background first
    await chrome.runtime.sendMessage({
      type: 'START_MEETING',
      platform: 'mic',
      title: title || `Reunião Presencial ${new Date().toLocaleDateString('pt-BR')}`,
    });

    // Activate mic recording in content script
    await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_ACTIVATE_MIC' });

    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    meeting = m;
    captionChunks = [];

    enterRecordingView(meeting);
  } catch (err) {
    alert(`Erro ao iniciar modo sala: ${err.message}`);
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
  stopTimer();
  showView('generating');
  setHeaderBadge('Gerando...', '');

  try {
    // End meeting
    const { meeting: endedMeeting } = await chrome.runtime.sendMessage({ type: 'END_MEETING' });
    meeting = endedMeeting || meeting;

    // Deactivate content script(s)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const platform = meeting?.platform;
        if (platform === 'hybrid') {
          // Hybrid: deactivate both platform captions and mic
          await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_DEACTIVATE' }).catch(() => {});
          await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_DEACTIVATE_MIC' }).catch(() => {});
        } else {
          const deactivateMsg = platform === 'mic' ? 'MEETSCRIBE_DEACTIVATE_MIC' : 'MEETSCRIBE_DEACTIVATE';
          await chrome.tabs.sendMessage(tab.id, { type: deactivateMsg }).catch(() => {});
        }
      }
    } catch (_) {}

    updateGeneratingStatus('Normalizando transcrição...');

    // Get audio chunks for Gemini re-analysis
    const { chunks: audioChunks } = await chrome.runtime.sendMessage({ type: 'GET_AUDIO_CHUNKS' });

    // Get caption chunks from background storage
    const { meeting: storedMeeting } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' })
      .catch(() => ({ meeting: null }));
    const allCaptions = storedMeeting?.captionChunks || captionChunks;

    let geminiTranscript = null;
    const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');

    // Try audio transcription with Gemini if we have audio and API key
    if (audioChunks?.length > 0 && geminiApiKey) {
      updateGeneratingStatus('Analisando áudio com IA...');
      geminiTranscript = await transcribeAudioWithGemini(geminiApiKey, audioChunks, allCaptions);
    }

    updateGeneratingStatus('Normalizando e reconciliando texto...');
    const normalizedTranscript = normalizeTranscript(allCaptions, geminiTranscript);

    // Save normalized transcript
    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD',
      field: 'normalizedTranscript',
      value: normalizedTranscript,
    });

    updateGeneratingStatus('Gerando ata com IA...');
    minutesMarkdown = await generateMinutes(
      meeting || storedMeeting,
      normalizedTranscript,
      updateGeneratingStatus
    );

    // Save minutes
    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD',
      field: 'minutesMarkdown',
      value: minutesMarkdown,
    });

    showMinutes(minutesMarkdown);
  } catch (err) {
    alert(`Erro ao gerar ata: ${err.message}`);
    showView('idle');
    setHeaderBadge('Inativo', '');
  }
}

function updateGeneratingStatus(text) {
  const el = document.getElementById('generatingStatus');
  if (el) el.textContent = text;
}

// ─── Show minutes ─────────────────────────────────────────────────────────────

function showMinutes(markdown) {
  showView('minutes');
  setHeaderBadge('Ata Pronta ✓', '');
  const preview = document.getElementById('minutesPreview');
  if (preview) preview.textContent = markdown;
}

// ─── History ──────────────────────────────────────────────────────────────────

async function loadHistory() {
  const { meetings = [] } = await chrome.runtime.sendMessage({ type: 'GET_MEETINGS_HISTORY' });
  const list = document.getElementById('historyList');
  if (!list) return;

  if (meetings.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 0;">Nenhuma reunião no histórico.</p>';
    return;
  }

  list.innerHTML = meetings
    .map((m) => {
      const date = new Date(m.startTime).toLocaleDateString('pt-BR');
      const dur = m.endTime
        ? `${Math.round((m.endTime - m.startTime) / 60000)} min`
        : '—';
      const platform = { 'google-meet': 'Meet', teams: 'Teams', mic: 'Sala', hybrid: 'Híbrido' }[m.platform] || m.platform;
      return `<div class="history-item" data-id="${m.id}">
        <div>
          <div class="h-title">${escapeHtml(m.title || 'Reunião sem título')}</div>
          <div class="h-meta">${date} · ${dur} · ${platform}</div>
        </div>
        <span style="font-size:18px;">›</span>
      </div>`;
    })
    .join('');

  list.querySelectorAll('.history-item').forEach((item) => {
    item.addEventListener('click', () => {
      const m = meetings.find((x) => x.id === item.dataset.id);
      if (m?.minutesMarkdown) showMinutes(m.minutesMarkdown);
    });
  });
}

// ─── Cancel recording ─────────────────────────────────────────────────────────

async function cancelRecording() {
  if (!confirm('Cancelar gravação? A transcrição atual será perdida.')) return;

  stopTimer();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_DEACTIVATE' }).catch(() => {});
      await chrome.tabs.sendMessage(tab.id, { type: 'MEETSCRIBE_DEACTIVATE_MIC' }).catch(() => {});
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
});

// ─── Check for existing in-progress meeting ───────────────────────────────────

async function checkExistingMeeting() {
  try {
    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    if (m && !m.endTime) {
      meeting = m;
      captionChunks = m.captionChunks || [];
      enterRecordingView(m);
      // Restore preview
      captionChunks.slice(-10).forEach(addChunkToPreview);
    } else if (m?.minutesMarkdown) {
      minutesMarkdown = m.minutesMarkdown;
      showMinutes(minutesMarkdown);
    }
  } catch (_) {}
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
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
  hybridToggle?.addEventListener('change', (e) => {
    if (multilingualTip) multilingualTip.style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('tipGoOptions')?.addEventListener('click', () =>
    chrome.runtime.openOptionsPage()
  );

  // Start buttons
  document.getElementById('btnStartPlatform')?.addEventListener('click', startPlatformRecording);
  document.getElementById('btnStartMic')?.addEventListener('click', startMicRecording);

  // Stop recording
  document.getElementById('btnStop')?.addEventListener('click', stopAndGenerate);
  document.getElementById('btnCancelRecording')?.addEventListener('click', cancelRecording);

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

  // Initial setup
  await detectPlatforms();
  await checkApiKey();
  await checkExistingMeeting();
});
