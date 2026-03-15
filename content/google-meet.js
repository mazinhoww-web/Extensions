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
    const speaker = (speakerEl?.textContent || '').trim() || lastSpeaker || 'Falante';

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
      timestamp: Date.now(),
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
      MeetScribe ativo — gravando transcrição
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
          // Send blob to background for IndexedDB storage
          const arrayBuffer = await e.data.arrayBuffer();
          chrome.runtime.sendMessage({
            type: 'AUDIO_CHUNK',
            blob: e.data,
          }).catch(() => {});
        }
      };

      // Record in 30-second chunks
      recorder.start(30000);

      audioProcessor = { recorder, ctx, stream };
    } catch (err) {
      console.warn('[MeetScribe] Audio capture failed (captions only mode):', err.message);
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

  // ─── Auto-detect caption activation ─────────────────────────────────────────
  // Watch for Google Meet captions being turned on by checking for caption container

  let captionCheckInterval = setInterval(() => {
    if (!isActive) return;
    const container = findElement(CONTAINER_SELECTORS);
    if (container && !overlayEl) showOverlay();
  }, 2000);

  // Clean up when page unloads
  window.addEventListener('beforeunload', () => {
    clearInterval(captionCheckInterval);
    if (isActive) deactivate();
  });

  console.log('[MeetScribe] Google Meet content script loaded. Click the extension icon to start transcribing.');
})();
