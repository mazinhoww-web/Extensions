// MeetScribe — Recorder Page (Gravação Offline)
// Runs natively as an extension page — no content script injection needed.

import { generateMinutes, transcribeAudioWithGemini } from '../utils/minutes-generator.js';
import { normalizeTranscript } from '../utils/text-normalizer.js';
import { exportTXT, exportPDF, copyToClipboard } from '../utils/exporter.js';
import { transcribeWithAssemblyAI } from '../utils/assemblyai-transcriber.js';

// ─── State ────────────────────────────────────────────────────────────────────

let isRecording = false;
let meeting     = null;
let captionChunks = [];
let minutesMarkdown = '';

// Timer
let timerInterval = null;
let startTime = null;

// Speech recognition
let recognition = null;
let lastSpeechTime = 0;
let speakerCount = 1;
let currentSpeakerIndex = 1;
const SPEAKER_GAP_MS = 2500;

// Audio pipeline
let mediaRecorder = null;
let audioStream   = null;
let audioCtx      = null;
let audioAnalyser = null;
let qualityAnimFrame = null;
const AUDIO_CHUNK_MS = 30000;

// ─── UI: State switching ──────────────────────────────────────────────────────

const STATES = ['Idle', 'Recording', 'Generating', 'Minutes'];

function showState(name) {
  STATES.forEach((s) => {
    const el = document.getElementById(`state${s}`);
    if (el) el.style.display = s.toLowerCase() === name ? 'block' : 'none';
  });
}

function setStatus(text, type = '') {
  const badge = document.getElementById('statusBadge');
  if (!badge) return;
  badge.textContent = text;
  badge.className = `status-badge${type ? ` ${type}` : ''}`;
}

function setGeneratingStatus(text, percent) {
  const el = document.getElementById('genStatus');
  if (el) el.textContent = text;
  if (percent !== undefined) {
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

function showError(msg) {
  const el = document.getElementById('errorBanner');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 10000);
  console.error('[MeetScribe Recorder]', msg);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function startTimer(fromTimestamp) {
  startTime = fromTimestamp || Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    const el = document.getElementById('timer');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ─── Transcript display ───────────────────────────────────────────────────────

function addChunkToDisplay(chunk) {
  const container = document.getElementById('transcript');
  if (!container) return;

  // Remove placeholder text on first entry
  const placeholder = container.querySelector('p');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'transcript-entry';
  entry.innerHTML =
    `<span class="speaker">${escapeHtml(chunk.speaker)}:</span> ` +
    `<span class="text">${escapeHtml(chunk.text)}</span>`;
  container.appendChild(entry);

  // Keep last 50 entries in DOM
  while (container.children.length > 50) container.removeChild(container.firstChild);
  container.scrollTop = container.scrollHeight;

  const count = document.getElementById('captionCount');
  if (count) count.textContent = `${captionChunks.length} trechos capturados`;
}

function showInterimText(speaker, text) {
  const el = document.getElementById('currentSpeaker');
  if (el) {
    el.style.display = 'block';
    el.textContent = `${speaker}: ${text}`;
  }
}

function clearInterimText() {
  const el = document.getElementById('currentSpeaker');
  if (el) el.style.display = 'none';
}

// ─── Speaker detection ────────────────────────────────────────────────────────

function checkSpeakerChange() {
  if (captionChunks.length === 0) return; // no change on very first chunk
  const gap = Date.now() - lastSpeechTime;
  if (gap > SPEAKER_GAP_MS && speakerCount < 10) {
    speakerCount++;
    currentSpeakerIndex = speakerCount;
  }
}

// ─── Speech Recognition ───────────────────────────────────────────────────────

function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('Web Speech API não suportada neste navegador. Use o Google Chrome.');

  recognition = new SR();
  recognition.continuous     = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text   = result[0].transcript.trim();
      if (!text) continue;

      checkSpeakerChange();
      const speaker = `Falante ${currentSpeakerIndex}`;
      lastSpeechTime = Date.now();

      if (result.isFinal) {
        clearInterimText();
        const chunk = {
          speaker,
          text,
          timestamp:  Date.now(),
          platform:   'mic',
          source:     'mic',
          confidence: result[0].confidence || 0.9,
        };
        captionChunks.push(chunk);
        addChunkToDisplay(chunk);
        chrome.runtime.sendMessage({ type: 'CAPTION_CHUNK', data: chunk }).catch(() => {});
      } else {
        showInterimText(speaker, text);
      }
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      document.getElementById('permError').style.display = 'block';
      stopRecording(true);
      return;
    }
    // Transient errors: restart if still recording
    if (isRecording) {
      try { recognition.stop(); } catch (_) {}
      setTimeout(() => { if (isRecording) try { recognition.start(); } catch (_) {} }, 300);
    }
  };

  recognition.onend = () => {
    if (isRecording) try { recognition.start(); } catch (_) {}
  };
}

// ─── Audio Pipeline ───────────────────────────────────────────────────────────
// Mirrors the pipeline in mic-fallback.js: highpass → compressor → gain → recorder

async function startAudioPipeline() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    audioCtx = new AudioContext({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(audioStream);

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value      = 30;
    compressor.ratio.value     = 12;
    compressor.attack.value    = 0.003;
    compressor.release.value   = 0.25;

    // Noise gate: suppress room echo/reverb tails below -55dB
    const noiseGate = audioCtx.createDynamicsCompressor();
    noiseGate.threshold.value = -55;
    noiseGate.knee.value      = 0;
    noiseGate.ratio.value     = 20;
    noiseGate.attack.value    = 0.001;
    noiseGate.release.value   = 0.1;

    const gain = audioCtx.createGain();
    gain.gain.value = 2.0;

    // Analyser for real-time audio quality indicator
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 256;

    const dest = audioCtx.createMediaStreamDestination();
    source.connect(highpass);
    highpass.connect(compressor);
    compressor.connect(noiseGate);
    noiseGate.connect(gain);
    gain.connect(audioAnalyser);
    gain.connect(dest);

    // Start RMS measurement loop (~10fps)
    startQualityMeter();

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 32000 });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size > 0) {
        chrome.runtime.sendMessage({ type: 'AUDIO_CHUNK', blob: e.data }).catch(() => {});
      }
    };

    mediaRecorder.start(AUDIO_CHUNK_MS);
  } catch (err) {
    // Non-fatal: transcription via Web Speech API still works
    console.warn('[MeetScribe Recorder] Audio pipeline failed:', err.message);
  }
}

async function stopAudioPipeline() {
  stopQualityMeter();
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (audioStream) audioStream.getTracks().forEach((t) => t.stop());
    if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close();
  } catch (_) {}
  mediaRecorder = null;
  audioStream   = null;
  audioCtx      = null;
  audioAnalyser = null;
}

// ─── Audio Quality Meter ──────────────────────────────────────────────────────

function startQualityMeter() {
  if (!audioAnalyser) return;
  const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);

  function measure() {
    if (!audioAnalyser) return;
    audioAnalyser.getByteTimeDomainData(dataArray);
    // Calculate RMS (0–1 range)
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    const fill = document.getElementById('audioQualityFill');
    const status = document.getElementById('audioQualityStatus');
    if (fill && status) {
      const pct = Math.min(100, Math.round(rms * 600)); // scale to 0-100
      fill.style.width = `${pct}%`;
      if (rms > 0.1) {
        fill.style.background = '#43a047'; // green — good
        status.textContent = 'Bom';
      } else if (rms > 0.03) {
        fill.style.background = '#f59e0b'; // yellow — medium
        status.textContent = 'Médio';
      } else {
        fill.style.background = '#ef4444'; // red — weak
        status.textContent = 'Fraco';
      }
    }
    qualityAnimFrame = setTimeout(measure, 100); // ~10fps
  }
  measure();
}

function stopQualityMeter() {
  if (qualityAnimFrame) {
    clearTimeout(qualityAnimFrame);
    qualityAnimFrame = null;
  }
  const fill = document.getElementById('audioQualityFill');
  const status = document.getElementById('audioQualityStatus');
  if (fill) fill.style.width = '0%';
  if (status) status.textContent = '—';
}

// Tab visibility: pause/resume audio when switching tabs
document.addEventListener('visibilitychange', () => {
  if (!isRecording || !audioCtx) return;
  if (document.hidden) {
    if (mediaRecorder?.state === 'recording') {
      try { mediaRecorder.requestData(); } catch (_) {}
    }
    if (audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
  } else {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        if (mediaRecorder?.state === 'inactive') {
          try { mediaRecorder.start(AUDIO_CHUNK_MS); } catch (_) {}
        }
      }).catch(() => {});
    }
  }
});

// ─── Start Recording ──────────────────────────────────────────────────────────

async function startRecording() {
  const titleInput = document.getElementById('titleInput');
  const title = titleInput?.value.trim() || `Reunião ${new Date().toLocaleDateString('pt-BR')}`;

  try {
    // Register meeting in background service worker
    const resp = await chrome.runtime.sendMessage({
      type:     'START_MEETING',
      platform: 'mic',
      title,
    });
    meeting = resp?.meeting || null;
    captionChunks = [];
    speakerCount  = 1;
    currentSpeakerIndex = 1;
    lastSpeechTime = Date.now();

    // Start speech recognition
    setupRecognition();
    recognition.start();

    // Start audio pipeline (non-blocking — failure is non-fatal)
    startAudioPipeline();

    showState('recording');
    setStatus('● Gravando', 'recording');
    startTimer();
    isRecording = true;

    // Reset transcript view
    const transcript = document.getElementById('transcript');
    if (transcript) {
      transcript.innerHTML =
        '<p style="color:#94a3b8;font-size:13px;text-align:center;padding-top:80px;">Aguardando fala...</p>';
    }
    const count = document.getElementById('captionCount');
    if (count) count.textContent = '0 trechos capturados';

  } catch (err) {
    showError(`Erro ao iniciar gravação: ${err.message}`);
  }
}

// ─── Stop Recording ───────────────────────────────────────────────────────────

async function stopRecording(cancelled = false) {
  isRecording = false;
  stopTimer();

  // Stop speech recognition
  try { recognition?.abort(); recognition = null; } catch (_) {}

  // Stop audio pipeline
  await stopAudioPipeline();

  if (cancelled) {
    await chrome.runtime.sendMessage({ type: 'CLEAR_MEETING' }).catch(() => {});
    meeting = null;
    captionChunks = [];
    showState('idle');
    setStatus('Pronto', '');
    return;
  }

  await generateAta();
}

// ─── Generate Minutes ─────────────────────────────────────────────────────────

async function generateAta() {
  showState('generating');
  setStatus('Gerando...', '');

  try {
    // End meeting in background
    const endResp = await chrome.runtime.sendMessage({ type: 'END_MEETING' });
    meeting = endResp?.meeting || meeting;

    setGeneratingStatus('Normalizando transcrição...', 10);

    // Use stored caption chunks (background has the authoritative list)
    const { meeting: stored } = await chrome.runtime
      .sendMessage({ type: 'GET_CURRENT_MEETING' })
      .catch(() => ({ meeting: null }));
    const allCaptions = stored?.captionChunks || captionChunks;

    // Recorder page is always Modo Sala (mic) — use AssemblyAI for real diarization
    const { chunks: audioChunks } = await chrome.runtime
      .sendMessage({ type: 'GET_AUDIO_CHUNKS' })
      .catch(() => ({ chunks: [] }));

    let assemblyTranscript = null;
    if (audioChunks?.length > 0) {
      setGeneratingStatus('Identificando falantes por voz...', 25);
      assemblyTranscript = await transcribeWithAssemblyAI(audioChunks).catch((err) => {
        console.warn('[MeetScribe] AssemblyAI falhou, usando transcrição local:', err.message);
        return null;
      });
    }

    setGeneratingStatus('Reconciliando texto...', 50);
    const captionsForNormalize = assemblyTranscript || allCaptions;
    const normalized = normalizeTranscript(captionsForNormalize, null);

    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD', field: 'normalizedTranscript', value: normalized,
    }).catch(() => {});

    setGeneratingStatus('Gerando ata com IA...', 65);
    minutesMarkdown = await generateMinutes(
      meeting || stored,
      normalized,
      setGeneratingStatus,
    );

    setGeneratingStatus('Salvando resultados...', 95);
    await chrome.runtime.sendMessage({
      type: 'SAVE_FIELD', field: 'minutesMarkdown', value: minutesMarkdown,
    }).catch(() => {});
    setGeneratingStatus('Concluído!', 100);

    showMinutes(minutesMarkdown);

  } catch (err) {
    showError(`Erro ao gerar ata: ${err.message}`);
    showState('idle');
    setStatus('Pronto', '');
  }
}

// ─── Show Minutes ─────────────────────────────────────────────────────────────

function showMinutes(markdown) {
  showState('minutes');
  setStatus('Ata Pronta ✓', 'success');
  const el = document.getElementById('minutesContent');
  if (el) el.textContent = markdown;
}

// ─── Resume state on page reload ─────────────────────────────────────────────

async function checkExistingSession() {
  try {
    const { meeting: m } = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' });
    if (!m) return;

    if (!m.endTime && m.platform === 'mic') {
      // Recording was in progress — show recording view and restart recognition
      meeting = m;
      captionChunks = m.captionChunks || [];
      isRecording = true;
      speakerCount = 1;
      currentSpeakerIndex = 1;
      lastSpeechTime = Date.now();

      showState('recording');
      setStatus('● Gravando', 'recording');
      startTimer(m.startTime);

      // Restore transcript
      const transcript = document.getElementById('transcript');
      if (transcript) transcript.innerHTML = '';
      captionChunks.forEach(addChunkToDisplay);

      const count = document.getElementById('captionCount');
      if (count) count.textContent = `${captionChunks.length} trechos capturados`;

      // Restart recognition (fresh, but meeting context preserved in background)
      setupRecognition();
      recognition.start();
      startAudioPipeline();

    } else if (m.minutesMarkdown && m.platform === 'mic') {
      // Minutes were already generated — show them
      minutesMarkdown = m.minutesMarkdown;
      showMinutes(minutesMarkdown);
    }
  } catch (_) {}
}

// ─── URL pre-fill ────────────────────────────────────────────────────────────

function prefillTitle() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get('title');
  if (title) {
    const input = document.getElementById('titleInput');
    if (input) input.value = decodeURIComponent(title);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  prefillTitle();

  document.getElementById('btnStart')?.addEventListener('click', startRecording);
  document.getElementById('btnStop')?.addEventListener('click', () => stopRecording(false));
  document.getElementById('btnCancel')?.addEventListener('click', () => stopRecording(true));

  document.getElementById('btnCopy')?.addEventListener('click', async () => {
    const ok = await copyToClipboard(minutesMarkdown);
    const btn = document.getElementById('btnCopy');
    if (btn) {
      btn.textContent = ok ? '✅ Copiado!' : '❌ Falhou';
      setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
    }
  });

  document.getElementById('btnTxt')?.addEventListener('click', () => {
    const filename = `ata-reuniao-${new Date().toISOString().slice(0, 10)}.txt`;
    exportTXT(minutesMarkdown, filename);
  });

  document.getElementById('btnPdf')?.addEventListener('click', () => {
    exportPDF(minutesMarkdown, meeting?.title || 'Ata de Reunião');
  });

  document.getElementById('btnNew')?.addEventListener('click', () => {
    minutesMarkdown = '';
    meeting = null;
    captionChunks = [];
    speakerCount = 1;
    currentSpeakerIndex = 1;
    const titleInput = document.getElementById('titleInput');
    if (titleInput) titleInput.value = '';
    chrome.runtime.sendMessage({ type: 'CLEAR_MEETING' }).catch(() => {});
    showState('idle');
    setStatus('Pronto', '');
  });

  // Check if resuming an in-progress session
  await checkExistingSession();
});
