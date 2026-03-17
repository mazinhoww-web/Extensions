// MeetScribe — Modo Sala (Microfone)
// Uses Web Speech API for real-time transcription when no meeting platform is detected.
// Speaker identification is done post-recording via AssemblyAI diarization.
// Audio is also recorded with Web Audio API processing for AssemblyAI re-analysis at the end.

(function () {
  if (window.__meetscribeMicLoaded) return;
  window.__meetscribeMicLoaded = true;

  // ─── State ─────────────────────────────────────────────────────────────────

  let isActive = false;
  let isHybridMode = false;
  let speakerPrefix = null; // e.g. 'Sala' in hybrid mode
  let recognition = null;
  let audioProcessor = null;
  let currentSpeakerIndex = 1;
  let finalTranscriptBuffer = [];
  let interimText = '';
  let overlayEl = null;

  // ─── Speaker label ──────────────────────────────────────────────────────────
  // During recording all chunks use a generic "Falante" label.
  // Real speaker identification is done post-recording via AssemblyAI diarization.

  function currentSpeaker() {
    return speakerPrefix ? `${speakerPrefix} - Falante ${currentSpeakerIndex}` : `Falante ${currentSpeakerIndex}`;
  }

  // ─── Web Speech API setup ───────────────────────────────────────────────────

  function buildRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[MeetScribe] Web Speech API not supported in this browser.');
      return null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = ''; // auto-detect language from browser/OS settings
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log('[MeetScribe] Speech recognition started');
    };

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text.length > 1) {
            const speaker = currentSpeaker();
            const chunk = {
              speaker,
              text,
              timestamp: Date.now(),
              platform: 'mic',
              source: isHybridMode ? 'room' : 'mic',
              confidence: result[0].confidence,
            };
            finalTranscriptBuffer.push(chunk);
            chrome.runtime.sendMessage({ type: 'CAPTION_CHUNK', data: chunk }).catch(() => {});
            updateOverlayText(speaker, text);
          }
        } else {
          interim += result[0].transcript;
        }
      }
      interimText = interim;
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech') {
        // Expected — restart
        restartRecognition();
      } else if (event.error === 'not-allowed') {
        console.error('[MeetScribe] Microphone permission denied.');
        showOverlay('⚠️ Permissão de microfone negada');
      } else {
        console.warn('[MeetScribe] Speech recognition error:', event.error);
        restartRecognition();
      }
    };

    rec.onend = () => {
      if (isActive) restartRecognition();
    };

    return rec;
  }

  function restartRecognition() {
    if (!isActive) return;
    setTimeout(() => {
      try {
        recognition?.start();
      } catch (_) {}
    }, 300);
  }

  // ─── Audio pipeline (for Gemini re-analysis) ─────────────────────────────────

  async function startAudioPipeline() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter to remove low-frequency noise
      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 80;
      highPass.Q.value = 0.7;

      // Compressor: normalize volume between different speakers
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Noise gate: suppress reverb tails and room echo below -55dB
      const noiseGate = ctx.createDynamicsCompressor();
      noiseGate.threshold.value = -55;
      noiseGate.knee.value = 0;
      noiseGate.ratio.value = 20;
      noiseGate.attack.value = 0.001;
      noiseGate.release.value = 0.1;

      // Gain: boost for clear input
      const gain = ctx.createGain();
      gain.gain.value = 2.0;

      const dest = ctx.createMediaStreamDestination();
      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(noiseGate);
      noiseGate.connect(gain);
      gain.connect(dest);

      const recorder = new MediaRecorder(dest.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
        audioBitsPerSecond: 32000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chrome.runtime.sendMessage({ type: 'AUDIO_CHUNK', blob: e.data }).catch(() => {});
        }
      };

      recorder.start(30000);
      audioProcessor = { recorder, ctx, stream };
    } catch (err) {
      console.warn('[MeetScribe] Audio pipeline failed:', err.message);
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

  // ─── Overlay ─────────────────────────────────────────────────────────────────

  function showOverlay(statusText) {
    if (overlayEl) {
      if (statusText) overlayEl.querySelector('.ms-status').textContent = statusText;
      return;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'meetscribe-mic-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(30, 30, 30, 0.94);
      color: #fff;
      padding: 12px 18px;
      border-radius: 12px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      z-index: 99999;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      min-width: 220px;
      max-width: 320px;
    `;
    const title = isHybridMode ? 'MeetScribe — Microfone Sala' : 'MeetScribe — Modo Sala';
    overlayEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#ff4444;display:inline-block;animation:ms-pulse2 1.5s infinite;flex-shrink:0;"></span>
        <strong>${title}</strong>
      </div>
      <div class="ms-status" style="font-size:12px;color:#ccc;">Ouvindo...</div>
      <div class="ms-last" style="margin-top:6px;font-size:11px;color:#aaa;font-style:italic;max-height:40px;overflow:hidden;"></div>
      <style>@keyframes ms-pulse2 { 0%,100%{opacity:1} 50%{opacity:0.3} }</style>
    `;
    document.body.appendChild(overlayEl);
  }

  function updateOverlayText(speaker, text) {
    if (!overlayEl) return;
    const lastEl = overlayEl.querySelector('.ms-last');
    const statusEl = overlayEl.querySelector('.ms-status');
    if (lastEl) lastEl.textContent = `${speaker}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`;
    if (statusEl) statusEl.textContent = 'Transcrevendo...';
  }

  function removeOverlay() {
    overlayEl?.remove();
    overlayEl = null;
  }

  // ─── Activate / Deactivate ──────────────────────────────────────────────────

  async function activate(options = {}) {
    if (isActive) return;
    isActive = true;
    isHybridMode = options.hybridMode === true;
    speakerPrefix = options.speakerPrefix || (isHybridMode ? 'Sala' : null);
    currentSpeakerIndex = 1;
    finalTranscriptBuffer = [];

    if (!isHybridMode) {
      // Standalone mic mode: create a new meeting in background
      await chrome.runtime.sendMessage({
        type: 'START_MEETING',
        platform: 'mic',
        title: `Reunião — Modo Sala ${new Date().toLocaleDateString('pt-BR')}`,
      }).catch(() => {});
    }
    // In hybrid mode the platform content script already started the meeting

    recognition = buildRecognition();
    if (recognition) {
      try {
        recognition.start();
      } catch (err) {
        console.error('[MeetScribe] Could not start recognition:', err);
      }
    }

    showOverlay();
    await startAudioPipeline();
  }

  async function deactivate() {
    if (!isActive) return;
    isActive = false;

    try {
      recognition?.stop();
    } catch (_) {}
    recognition = null;

    stopAudioPipeline();
    removeOverlay();

    if (!isHybridMode) {
      // Only end the meeting if this is the sole source (standalone mic mode)
      await chrome.runtime.sendMessage({ type: 'END_MEETING' }).catch(() => {});
    }
  }

  // ─── Public API (used by popup via scripting.executeScript) ─────────────────

  window.__meetscribeMic = { activate, deactivate };

  // ─── Message listener ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'MEETSCRIBE_ACTIVATE_MIC') {
      activate({ hybridMode: msg.hybridMode, speakerPrefix: msg.speakerPrefix }).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === 'MEETSCRIBE_DEACTIVATE_MIC') {
      deactivate().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === 'MEETSCRIBE_STATUS') {
      sendResponse({ isActive, platform: 'mic' });
    }
  });

  // Tab visibility: pause/resume audio pipeline when switching tabs
  document.addEventListener('visibilitychange', () => {
    if (!audioProcessor) return;
    if (document.hidden) {
      if (audioProcessor.recorder?.state === 'recording') {
        try { audioProcessor.recorder.requestData(); } catch (_) {}
      }
      if (audioProcessor.ctx?.state === 'running') {
        audioProcessor.ctx.suspend().catch(() => {});
      }
    } else {
      if (audioProcessor.ctx?.state === 'suspended') {
        audioProcessor.ctx.resume().then(() => {
          if (audioProcessor.recorder?.state === 'inactive') {
            try { audioProcessor.recorder.start(30000); } catch (_) {}
          }
        }).catch(() => {});
      }
    }
  });

  // Resume AudioContext on reconnect (Chrome suspends it when offline in some cases)
  window.addEventListener('online', () => {
    if (audioProcessor?.ctx?.state === 'suspended') {
      audioProcessor.ctx.resume().catch(() => {});
    }
  });

  window.addEventListener('beforeunload', () => {
    if (isActive) deactivate();
  });

  console.log('[MeetScribe] Mic fallback script loaded.');
})();
