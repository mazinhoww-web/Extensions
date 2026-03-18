// MeetScribe — Google Meet Content Script
// Observes the Meet DOM for live captions and forwards them to the background worker.
// Also manages the audio recording pipeline via AudioProcessor.

(function () {
  if (window.__meetscribeGoogleMeetLoaded) return;
  window.__meetscribeGoogleMeetLoaded = true;

  // ─── Caption DOM selectors (multiple fallbacks for Meet UI changes) ───────

  // Google Meet renders captions in a container. The actual selectors change
  // with Meet's frequent updates, so we try several strategies:
  const CAPTION_SELECTORS = [
    // Modern Meet (2024-2025): transcript/closed-caption panel
    '[data-message-text]',
    '[jsname="tgaKEf"]',
    '.a4cQT .zs7s8d',
    // Legacy selectors
    '.CNusmb span',
    '.iOzk7 span',
    '.ygGdYd',
    // Generic: look for elements inside the captions container
    '[data-self-name]',
  ];

  const SPEAKER_SELECTORS = [
    '[data-sender-name]',
    '[jsname="EydYod"]',
    '.zs7s8d.jxFHg',
    '.KF4T6b',
    '[data-self-name]',
  ];

  // Caption container selectors
  const CONTAINER_SELECTORS = [
    '[jsname="dsyhDe"]', // caption root 2024
    '.a4cQT',
    '[class*="caption"]',
    '[aria-label*="captions"]',
    '[aria-label*="Captions"]',
    '[data-caption-id]',
  ];

  // ─── State ─────────────────────────────────────────────────────────────────

  let isActive = false;
  let lastSpeaker = '';
  let lastText = '';
  let observer = null;
  let overlayEl = null;
  let audioProcessor = null;
  let meetingStarted = false;
  let overlayEnabled = true; // cached from showOverlay setting

  // ─── Caption latency correction ──────────────────────────────────────────────
  // Tracks when each caption text prefix first appeared in the DOM.
  // Using firstSeen instead of Date.now()-at-finalization gives a timestamp
  // much closer to when the speech actually occurred, correcting high-latency drift.
  const captionFirstSeen = new Map(); // `${speaker}::${prefix}` → timestamp

  function getOrRecordFirstSeen(speaker, text) {
    const prefix = `${speaker}::${text.slice(0, 30)}`;
    if (!captionFirstSeen.has(prefix)) {
      captionFirstSeen.set(prefix, Date.now());
      // Evict oldest entries to avoid unbounded growth
      if (captionFirstSeen.size > 50) {
        captionFirstSeen.delete(captionFirstSeen.keys().next().value);
      }
    }
    return captionFirstSeen.get(prefix);
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  function findElement(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function findAllElements(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const els = root.querySelectorAll(sel);
        if (els.length) return Array.from(els);
      } catch (_) {}
    }
    return [];
  }

  // ─── Caption extraction ─────────────────────────────────────────────────────

  function extractCaption(mutationTarget) {
    // Try to find the nearest caption block
    let captionEl = mutationTarget;
    let speakerEl = null;
    let textEl = null;

    // Walk up to find a caption block that has both speaker + text
    for (let i = 0; i < 6; i++) {
      if (!captionEl || captionEl === document.body) break;

      // Try to find speaker within this block
      speakerEl = findElement(SPEAKER_SELECTORS, captionEl);
      textEl = findElement(CAPTION_SELECTORS, captionEl);

      if (speakerEl || textEl) break;
      captionEl = captionEl.parentElement;
    }

    // Fallback: scan all visible caption blocks
    if (!textEl) {
      const allCaptions = findAllElements(CAPTION_SELECTORS);
      if (allCaptions.length) textEl = allCaptions[allCaptions.length - 1];
    }

    const text = (textEl?.textContent || mutationTarget?.textContent || '').trim();
    const rawSpeaker = (speakerEl?.textContent || '').trim();
    const isValidName = rawSpeaker.length > 1 && !/^\d+[\d\s.,]*$/.test(rawSpeaker);
    const speaker = (isValidName ? rawSpeaker : '') || lastSpeaker || 'Falante';

    return { speaker, text };
  }

  // ─── Process a caption update ───────────────────────────────────────────────

  function processCaption(speaker, text) {
    if (!text || text.length < 2) return;
    if (text === lastText && speaker === lastSpeaker) return;

    // Only send when text stabilizes (speaker stopped or changed)
    // We send on every update for real-time preview, background deduplicates
    lastSpeaker = speaker;
    lastText = text;

    const chunk = {
      speaker,
      text,
      timestamp: getOrRecordFirstSeen(speaker, text),
      platform: 'google-meet',
    };

    chrome.runtime.sendMessage({ type: 'CAPTION_CHUNK', data: chunk }).catch(() => {});
  }

  // ─── MutationObserver ───────────────────────────────────────────────────────

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            const { speaker, text } = extractCaption(node.parentElement);
            processCaption(speaker, text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const { speaker, text } = extractCaption(node);
            processCaption(speaker, text);
          }
        }

        if (mutation.type === 'characterData') {
          const { speaker, text } = extractCaption(mutation.target.parentElement);
          processCaption(speaker, text);
        }
      }
    });

    // Observe the entire body since Meet's caption container moves around
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
  }

  // ─── Overlay UI ─────────────────────────────────────────────────────────────

  function showOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'meetscribe-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(26, 115, 232, 0.92);
      color: #fff;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: 'Google Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      pointer-events: none;
    `;
    overlayEl.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:#ff4444;display:inline-block;animation:meetscribe-pulse 1.5s infinite;"></span>
      ${chrome.i18n.getMessage('overlayActive') || 'MeetScribe ativo — gravando transcrição'}
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes meetscribe-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`;
    document.head.appendChild(style);
    document.body.appendChild(overlayEl);
  }

  function removeOverlay() {
    overlayEl?.remove();
    overlayEl = null;
  }

  // ─── Audio recording pipeline ────────────────────────────────────────────────

  async function startAudioPipeline() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter: remove low-frequency noise (HVAC, rumble)
      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 80;
      highPass.Q.value = 0.7;

      // Dynamic compressor: normalize volume between speakers
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Gain: slight boost
      const gain = ctx.createGain();
      gain.gain.value = 2.0; // ~+6dB

      // Chain: source → highpass → compressor → gain → destination
      const dest = ctx.createMediaStreamDestination();
      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(gain);
      gain.connect(dest);

      // MediaRecorder on processed stream
      const recorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000,
      });

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          // Blobs do not survive chrome.runtime.sendMessage JSON serialization,
          // so we convert to Uint8Array before sending.
          const arrayBuffer = await e.data.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          chrome.runtime.sendMessage({
            type: 'AUDIO_CHUNK',
            audioData: Array.from(uint8Array),
            mimeType: e.data.type || 'audio/webm',
          }).catch(() => {});
        }
      };

      // Record in 30-second chunks
      recorder.start(30000);

      audioProcessor = { recorder, ctx, stream };
    } catch (err) {
      console.warn('[MeetScribe] Audio capture failed (captions only mode):', err.message);
      chrome.runtime.sendMessage({ type: 'AUDIO_PIPELINE_ERROR', error: err.message }).catch(() => {});
      // Continue without audio — captions only
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

  // ─── Auto-enable captions ───────────────────────────────────────────────────
  // Attempts to click the CC toggle button so the user doesn't need to do it manually.

  const CC_BUTTON_SELECTORS = [
    '[data-tooltip="Turn on captions"]',
    '[aria-label="Turn on captions"]',
    '[data-tooltip="Ativar legendas"]',
    '[aria-label="Ativar legendas"]',
    '[data-tooltip="Activar subtítulos"]',
    '[aria-label="Activar subtítulos"]',
    '[data-tooltip="Activer les sous-titres"]',
    '[aria-label="Activer les sous-titres"]',
    '[jsname="r8qRAd"]',
  ];

  function tryEnableCaptions() {
    if (findElement(CONTAINER_SELECTORS)) return; // already active
    const btn = findElement(CC_BUTTON_SELECTORS);
    if (btn) {
      btn.click();
      console.log('[MeetScribe] Auto-enabled captions.');
    }
  }

  // ─── No-caption warning after 30 seconds ────────────────────────────────────

  let captionWarnTimeout = null;

  function scheduleCaptionWarning() {
    captionWarnTimeout = setTimeout(() => {
      if (!isActive) return;
      if (captionFirstSeen.size === 0) {
        chrome.runtime.sendMessage({
          type: 'CAPTION_WARNING',
          message: 'noCaptionsDetected',
        }).catch(() => {});
      }
    }, 30000);
  }

  function cancelCaptionWarning() {
    clearTimeout(captionWarnTimeout);
    captionWarnTimeout = null;
  }

  // ─── Activate / Deactivate ──────────────────────────────────────────────────

  async function activate() {
    if (isActive) return;
    isActive = true;

    await chrome.runtime.sendMessage({
      type: 'START_MEETING',
      platform: 'google-meet',
      title: document.title.replace(' — Google Meet', '').trim(),
    }).catch(() => {});

    meetingStarted = true;
    tryEnableCaptions();
    startObserver();

    const { showOverlay: showOverlaySetting = true } = await chrome.storage.sync.get('showOverlay');
    overlayEnabled = showOverlaySetting !== false;
    if (overlayEnabled) showOverlay();

    scheduleCaptionWarning();
    await startAudioPipeline();
  }

  async function deactivate() {
    if (!isActive) return;
    isActive = false;

    cancelCaptionWarning();
    stopObserver();
    stopAudioPipeline();
    removeOverlay();

    await chrome.runtime.sendMessage({ type: 'END_MEETING' }).catch(() => {});
  }

  // ─── Listen for messages from popup ─────────────────────────────────────────

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
      sendResponse({ isActive, platform: 'google-meet' });
    }
  });

  // ─── Overlay keep-alive + auto-stop detection ────────────────────────────────
  let callEndedCount = 0;
  let captionCheckInterval = setInterval(() => {
    if (!isActive) return;
    const container = findElement(CONTAINER_SELECTORS);
    if (overlayEnabled && container && !overlayEl) showOverlay();

    // Auto-stop: detect when user has left the call (leave button gone from DOM)
    if (!isInActiveCall()) {
      callEndedCount++;
      if (callEndedCount >= 2) { // 2 × 2s = 4s of confirmation before triggering
        deactivate();
      }
    } else {
      callEndedCount = 0;
    }
  }, 2000);

  // ─── Auto-start detection ─────────────────────────────────────────────────────
  // Detects when the user actually joins a call (leave button appears in DOM)
  // and auto-activates recording without requiring a manual click.

  const MEET_LEAVE_SELECTORS = [
    // EN
    '[data-tooltip="Leave call"]',
    '[aria-label="Leave call"]',
    // PT-BR
    '[data-tooltip="Sair da chamada"]',
    '[aria-label="Sair da chamada"]',
    // ES
    '[data-tooltip="Salir de la llamada"]',
    '[aria-label="Salir de la llamada"]',
    // FR
    '[data-tooltip="Quitter l\'appel"]',
    '[aria-label="Quitter l\'appel"]',
    // Structural (language-independent)
    '[jsname="CQylAd"]',
  ];

  function isInActiveCall() {
    if (!/meet\.google\.com\/.+/.test(location.href)) return false;
    return MEET_LEAVE_SELECTORS.some((sel) => document.querySelector(sel));
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

  // Tab visibility: pause/resume audio pipeline to avoid data loss from Chrome throttling
  document.addEventListener('visibilitychange', () => {
    if (!audioProcessor) return;
    if (document.hidden) {
      // Pause MediaRecorder when tab goes background to avoid empty/corrupt chunks
      if (audioProcessor.recorder?.state === 'recording') {
        try { audioProcessor.recorder.requestData(); } catch (_) {} // flush current chunk
      }
      if (audioProcessor.ctx?.state === 'running') {
        audioProcessor.ctx.suspend().catch(() => {});
      }
    } else {
      // Resume when tab comes back to foreground
      if (audioProcessor.ctx?.state === 'suspended') {
        audioProcessor.ctx.resume().then(() => {
          // Restart recorder if it stopped while suspended
          if (audioProcessor.recorder?.state === 'inactive') {
            try { audioProcessor.recorder.start(30000); } catch (_) {}
          }
        }).catch(() => {});
      }
    }
  });

  // Network status: update overlay and resume AudioContext on reconnect
  window.addEventListener('offline', () => {
    if (overlayEl) overlayEl.innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
       MeetScribe — sem conexão (gravando local)`;
  });
  window.addEventListener('online', () => {
    if (overlayEl) overlayEl.innerHTML =
      `<span style="width:8px;height:8px;border-radius:50%;background:#ff4444;display:inline-block;animation:meetscribe-pulse 1.5s infinite;"></span>
       ${chrome.i18n.getMessage('overlayActive') || 'MeetScribe ativo — gravando transcrição'}`;
    // Resume AudioContext if it was suspended
    if (audioProcessor?.ctx?.state === 'suspended') {
      audioProcessor.ctx.resume().catch(() => {});
    }
  });

  // Clean up when page unloads
  window.addEventListener('beforeunload', () => {
    clearInterval(captionCheckInterval);
    if (isActive) deactivate();
  });

  console.log('[MeetScribe] Google Meet content script loaded. Auto-start enabled by default.');
})();
