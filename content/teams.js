// MeetScribe — Microsoft Teams Content Script
// Observes Teams DOM for live captions/transcription and forwards to background worker.

(function () {
  if (window.__meetscribeTeamsLoaded) return;
  window.__meetscribeTeamsLoaded = true;

  // ─── Teams caption selectors ─────────────────────────────────────────────────
  // Teams uses Fluent UI components. Selectors are grouped by Teams version.

  const CAPTION_TEXT_SELECTORS = [
    // Teams web 2024-2025 (Fluent UI v9)
    '[data-tid="closed-caption-text"]',
    '.fui-Caption1',
    '[class*="captionText"]',
    '[class*="caption-text"]',
    // Older Teams
    '.ts-captions-container .ts-caption-text',
    '[data-automation-id="caption-text"]',
    // Transcription panel
    '[data-tid="meeting-transcript-content"]',
    '.transcript-message-content',
    '[class*="transcriptMessage"]',
  ];

  const SPEAKER_TEXT_SELECTORS = [
    '[data-tid="closed-caption-speaker-name"]',
    '[class*="speakerName"]',
    '[class*="captionSpeaker"]',
    '.ts-caption-speaker',
    '[data-automation-id="caption-speaker"]',
    // Transcription panel speaker
    '[data-tid="meeting-transcript-speaker-name"]',
    '[class*="transcriptSpeaker"]',
    '.transcript-author',
  ];

  const CAPTION_CONTAINER_SELECTORS = [
    '[data-tid="closed-captions-renderer"]',
    '[class*="captionsRenderer"]',
    '.ts-captions-container',
    '[data-automation-id="caption-container"]',
    // Transcription side panel
    '[data-tid="meeting-transcript-container"]',
    '[class*="transcriptContainer"]',
  ];

  // ─── State ─────────────────────────────────────────────────────────────────

  let isActive = false;
  let lastSpeaker = '';
  let lastText = '';
  let observer = null;
  let overlayEl = null;
  let audioProcessor = null;
  let processedEntries = new Set(); // deduplicate by text hash

  // ─── Utilities ──────────────────────────────────────────────────────────────

  function findEl(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function findAllEl(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const els = root.querySelectorAll(sel);
        if (els.length) return Array.from(els);
      } catch (_) {}
    }
    return [];
  }

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
  }

  // ─── Caption extraction from a DOM node ─────────────────────────────────────

  function extractFromNode(node) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    let speakerEl = null;
    let textEl = null;

    // Walk up to find a caption block containing both speaker and text
    for (let i = 0; i < 8; i++) {
      if (!el || el === document.body) break;
      speakerEl = findEl(SPEAKER_TEXT_SELECTORS, el);
      textEl = findEl(CAPTION_TEXT_SELECTORS, el);
      if (textEl) break;
      el = el.parentElement;
    }

    const text = (textEl?.textContent || node?.textContent || '').trim();
    const speaker =
      (speakerEl?.textContent || '').trim().replace(/:\s*$/, '') ||
      lastSpeaker ||
      'Falante';

    return { speaker, text };
  }

  // ─── Scan all visible captions (bulk extraction from transcription panel) ────

  function scanAllCaptions() {
    const containers = findAllEl(CAPTION_CONTAINER_SELECTORS);
    if (!containers.length) return;

    containers.forEach((container) => {
      const textEls = findAllEl(CAPTION_TEXT_SELECTORS, container);
      const speakerEls = findAllEl(SPEAKER_TEXT_SELECTORS, container);

      // Pair speakers with text elements by DOM order
      textEls.forEach((textEl, i) => {
        const text = textEl.textContent.trim();
        const speakerEl = speakerEls[i] || speakerEls[speakerEls.length - 1];
        const speaker =
          (speakerEl?.textContent || '').trim().replace(/:\s*$/, '') ||
          lastSpeaker ||
          'Falante';

        processCaption(speaker, text);
      });
    });
  }

  // ─── Process a caption ──────────────────────────────────────────────────────

  function processCaption(speaker, text) {
    if (!text || text.length < 2) return;

    const key = `${speaker}:${simpleHash(text)}`;
    if (processedEntries.has(key)) return;
    processedEntries.add(key);

    // Keep set from growing unbounded
    if (processedEntries.size > 5000) {
      const arr = Array.from(processedEntries);
      processedEntries = new Set(arr.slice(-2000));
    }

    lastSpeaker = speaker;
    lastText = text;

    const chunk = {
      speaker,
      text,
      timestamp: Date.now(),
      platform: 'teams',
    };

    chrome.runtime.sendMessage({ type: 'CAPTION_CHUNK', data: chunk }).catch(() => {});
  }

  // ─── MutationObserver ───────────────────────────────────────────────────────

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // New nodes added (new caption entry)
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text.length > 1) {
              const { speaker } = extractFromNode(node);
              processCaption(speaker, text);
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const { speaker, text } = extractFromNode(node);
            processCaption(speaker, text);
          }
        }

        // Text content changed (caption being typed)
        if (mutation.type === 'characterData') {
          const { speaker, text } = extractFromNode(mutation.target);
          processCaption(speaker, text);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Initial scan in case captions are already visible
    setTimeout(scanAllCaptions, 1000);
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
  }

  // ─── Overlay ─────────────────────────────────────────────────────────────────

  function showOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'meetscribe-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(98, 100, 167, 0.95);
      color: #fff;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      pointer-events: none;
    `;
    overlayEl.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:#ff4444;display:inline-block;animation:ms-pulse 1.5s infinite;"></span>
      MeetScribe ativo — gravando transcrição
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes ms-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`;
    document.head.appendChild(style);
    document.body.appendChild(overlayEl);
  }

  function removeOverlay() {
    overlayEl?.remove();
    overlayEl = null;
  }

  // ─── Audio pipeline ──────────────────────────────────────────────────────────

  async function startAudioPipeline() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);

      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 80;
      highPass.Q.value = 0.7;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      const gain = ctx.createGain();
      gain.gain.value = 2.0;

      const dest = ctx.createMediaStreamDestination();
      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(gain);
      gain.connect(dest);

      const recorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000,
      });

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          chrome.runtime.sendMessage({ type: 'AUDIO_CHUNK', blob: e.data }).catch(() => {});
        }
      };

      recorder.start(30000);
      audioProcessor = { recorder, ctx, stream };
    } catch (err) {
      console.warn('[MeetScribe] Audio capture failed (captions only):', err.message);
    }
  }

  function stopAudioPipeline() {
    if (!audioProcessor) return;
    try {
      audioProcessor.recorder.stop();
      audioProcessor.stream.getTracks().forEach((t) => t.stop());
      audioProcessor.ctx.close();
    } catch (_) {}
    audioProcessor = null;
  }

  // ─── Activate / Deactivate ──────────────────────────────────────────────────

  async function activate() {
    if (isActive) return;
    isActive = true;
    processedEntries.clear();

    await chrome.runtime.sendMessage({
      type: 'START_MEETING',
      platform: 'teams',
      title: document.title.replace(' | Microsoft Teams', '').trim(),
    }).catch(() => {});

    startObserver();
    showOverlay();
    await startAudioPipeline();
  }

  async function deactivate() {
    if (!isActive) return;
    isActive = false;
    stopObserver();
    stopAudioPipeline();
    removeOverlay();
    await chrome.runtime.sendMessage({ type: 'END_MEETING' }).catch(() => {});
  }

  // ─── Message listener ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'MEETSCRIBE_ACTIVATE') {
      activate().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === 'MEETSCRIBE_DEACTIVATE') {
      deactivate().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === 'MEETSCRIBE_STATUS') {
      sendResponse({ isActive, platform: 'teams' });
    }
  });

  // ─── Auto-start detection ─────────────────────────────────────────────────────
  // Detects when the user actually joins a Teams call (hangup button appears)
  // and auto-activates recording without requiring a manual click.

  const TEAMS_LEAVE_SELECTORS = [
    '[data-tid="hangup-button"]',
    '[data-tid="hangup-button-hangup"]',
  ];

  function isInActiveCall() {
    return TEAMS_LEAVE_SELECTORS.some((sel) => document.querySelector(sel));
  }

  async function maybeAutoActivate() {
    if (isActive) return;
    const { autoStartPlatform = true } = await chrome.storage.sync.get('autoStartPlatform');
    if (!autoStartPlatform) return;
    const resp = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_MEETING' }).catch(() => ({}));
    if (resp?.meeting && !resp.meeting.endTime) return; // already recording
    activate();
  }

  (function startAutoDetect() {
    if (isInActiveCall()) { maybeAutoActivate(); return; }
    const poll = setInterval(() => {
      if (isActive) { clearInterval(poll); return; }
      if (isInActiveCall()) { clearInterval(poll); maybeAutoActivate(); }
    }, 2000);
    setTimeout(() => clearInterval(poll), 3 * 60 * 60 * 1000); // expire after 3h
  })();

  window.addEventListener('beforeunload', () => {
    if (isActive) deactivate();
  });

  console.log('[MeetScribe] Teams content script loaded. Auto-start enabled by default.');
})();
